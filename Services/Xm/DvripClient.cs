using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace CentroSeguridad.Services.Xm
{
    /// <summary>
    /// Cliente TCP del protocolo XM (puerto 34567). Es BLOQUEANTE: llamar desde un hilo de fondo.
    /// Una instancia = una sesión de la cámara. Cada mensaje es una cabecera de 20 bytes (little-endian)
    /// + cuerpo JSON terminado en "\n\0".
    /// <code>
    /// using (var c = new DvripClient("192.168.1.10")) { c.Login("admin", ""); c.PtzStart(PtzCmd.Left); }
    /// </code>
    /// </summary>
    public sealed class DvripClient : IDisposable
    {
        /// <summary>Valor de <c>Preset</c> que INICIA un movimiento continuo.</summary>
        public const int PtzStartValue = 65535;
        /// <summary>Valor de <c>Preset</c> que PARA un movimiento continuo (al revés de lo intuitivo).</summary>
        public const int PtzStopValue = -1;

        /// <summary>Paquete recibido: ID de mensaje, sesión y cuerpo en bruto.</summary>
        public sealed class Packet
        {
            public int MsgId;
            public int Session;
            public byte[] Body;

            /// <summary>Cuerpo interpretado como JSON (null si no lo es). El llamante debe hacer Dispose.</summary>
            public JsonDocument Json()
            {
                try { return JsonDocument.Parse(Encoding.UTF8.GetString(Body).Trim('\0', '\n', '\r', ' ', '\t')); }
                catch (JsonException) { return null; }
            }
        }

        private readonly string _host;
        private readonly int _port;
        private readonly int _timeoutMs;
        private readonly object _sendLock = new object();
        private TcpClient _tcp;
        private NetworkStream _stream;
        private int _seq;

        /// <summary>ID de sesión asignado por la cámara tras el login.</summary>
        public int Session { get; private set; }
        /// <summary>Segundos entre keepalives que pide la cámara.</summary>
        public int AliveIntervalSec { get; private set; } = 20;
        /// <summary>Número de canales (1 en cámaras, varios en NVR/DVR).</summary>
        public int ChannelCount { get; private set; } = 1;

        private string SessionStr => "0x" + Session.ToString("X8");

        public DvripClient(string host, int port = 34567, int timeoutMs = 5000)
        {
            _host = host; _port = port; _timeoutMs = timeoutMs;
        }

        // ------------------------------------------------------------ transporte

        /// <summary>Abre el socket TCP (con timeout de conexión).</summary>
        public void Connect()
        {
            var tcp = new TcpClient { NoDelay = true };
            try
            {
                var task = tcp.ConnectAsync(_host, _port);
                if (!task.Wait(_timeoutMs)) { tcp.Close(); throw new TimeoutException("Sin respuesta de " + _host + ":" + _port); }
            }
            catch (AggregateException ae)
            {
                tcp.Close();
                throw new IOException(ae.InnerException != null ? ae.InnerException.Message : ae.Message, ae.InnerException);
            }
            tcp.ReceiveTimeout = _timeoutMs;
            tcp.SendTimeout = _timeoutMs;
            _tcp = tcp;
            _stream = tcp.GetStream();
        }

        /// <summary>Cambia el timeout de lectura (ms).</summary>
        public void SetReadTimeout(int ms) { if (_tcp != null) _tcp.ReceiveTimeout = ms; }

        /// <summary>Espera hasta [ms] a que haya datos que leer (true también si la conexión se cerró).</summary>
        public bool WaitReadable(int ms)
        {
            if (_tcp == null) throw new IOException("No conectado");
            return _tcp.Client.Poll(ms * 1000, SelectMode.SelectRead);
        }

        /// <summary>Envía un mensaje (cabecera + JSON). Acepta Dictionary, objetos anónimos o string JSON.</summary>
        public void Send(int msgId, object body)
        {
            string json = body as string ?? JsonSerializer.Serialize(body);
            lock (_sendLock)
            {
                if (_stream == null) throw new IOException("No conectado");
                byte[] packet = BuildPacket(Session, _seq++, msgId, json);
                _stream.Write(packet, 0, packet.Length);
                _stream.Flush();
            }
        }

        /// <summary>Lee el siguiente paquete (bloquea hasta el timeout de lectura).</summary>
        public Packet ReadPacket()
        {
            if (_stream == null) throw new IOException("No conectado");
            return ReadFrom(_stream);
        }

        /// <summary>
        /// Envía una petición y espera la respuesta <paramref name="expect"/> (por defecto msgId + 1).
        /// Ignora otros paquetes que lleguen en medio (alarmas, keepalives...). El llamante hace Dispose del JSON.
        /// </summary>
        public JsonDocument Request(int msgId, object body, int expect = -1)
        {
            if (expect < 0) expect = msgId + 1;
            Send(msgId, body);
            var limite = DateTime.UtcNow.AddMilliseconds(_timeoutMs * 2.0);
            while (DateTime.UtcNow < limite)
            {
                var p = ReadPacket();
                if (p.MsgId != expect) continue;
                var j = p.Json();
                if (j == null) throw new IOException("Respuesta no JSON");
                return j;
            }
            throw new IOException("Sin respuesta al mensaje " + msgId);
        }

        public void Dispose()
        {
            try { _tcp?.Close(); } catch (Exception) { /* ya cerrado */ }
            _tcp = null; _stream = null;
        }

        // ------------------------------------------------------------ sesión

        /// <summary>Conecta y hace login. Lanza <see cref="XmException"/> si la cámara rechaza las credenciales.</summary>
        public void Login(string user, string password)
        {
            Connect();
            var req = new Dictionary<string, object>
            {
                ["EncryptType"] = "MD5",
                ["LoginType"] = "DVRIP-Web",
                ["PassWord"] = XmCrypto.HashPassword(password),
                ["UserName"] = user
            };
            using (var r = Request(Msg.Login, req))
            {
                var root = r.RootElement;
                CheckRet(root);
                Session = ParseHex(GetString(root, "SessionID", "0x0"));
                AliveIntervalSec = GetInt(root, "AliveInterval", 20);
                ChannelCount = GetInt(root, "ChannelNum", 1);
            }
        }

        /// <summary>Mantiene viva la sesión. No espera respuesta.</summary>
        public void KeepAlive() => Send(Msg.KeepAlive, Base("KeepAlive"));

        private Dictionary<string, object> Base(string nombre) =>
            new Dictionary<string, object> { ["Name"] = nombre, ["SessionID"] = SessionStr };

        private static void CheckRet(JsonElement r)
        {
            if (r.TryGetProperty("Ret", out var v) && v.ValueKind == JsonValueKind.Number)
            {
                int ret = v.GetInt32();
                if (!RetCodes.EsOk(ret)) throw new XmException(RetCodes.Describir(ret), ret);
            }
        }

        // ------------------------------------------------------------ información y configuración

        /// <summary>Información del sistema (serie, versión, canales...) como pares clave -> valor en texto.</summary>
        public Dictionary<string, string> SystemInfo()
        {
            var res = new Dictionary<string, string>();
            using (var r = Request(Msg.SysInfo, Base("SystemInfo")))
            {
                if (r.RootElement.TryGetProperty("SystemInfo", out var si) && si.ValueKind == JsonValueKind.Object)
                    foreach (var p in si.EnumerateObject())
                        res[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : p.Value.GetRawText();
            }
            return res;
        }

        /// <summary>Hora de la cámara ("yyyy-MM-dd HH:mm:ss") o cadena vacía.</summary>
        public string GetTime()
        {
            using (var r = Request(Msg.TimeQuery, Base("OPTimeQuery"))) return GetString(r.RootElement, "OPTimeQuery");
        }

        /// <summary>Fija la hora de la cámara. Formato "yyyy-MM-dd HH:mm:ss".</summary>
        public void SetTime(string time)
        {
            var m = Base("OPTimeSetting"); m["OPTimeSetting"] = time;
            using (var r = Request(Msg.TimeSet, m)) CheckRet(r.RootElement);
        }

        /// <summary>Reinicia la cámara (la conexión se cortará). No espera respuesta.</summary>
        public void Reboot()
        {
            var m = Base("OPMachine"); m["OPMachine"] = new Dictionary<string, object> { ["Action"] = "Reboot" };
            Send(Msg.Machine, m);
        }

        /// <summary>Lee un bloque de configuración (p. ej. "Detect.MotionDetect") como JSON en bruto (objeto o array).</summary>
        public string GetConfigRaw(string nombre)
        {
            using (var r = Request(Msg.ConfigGet, Base(nombre)))
            {
                CheckRet(r.RootElement);
                return r.RootElement.TryGetProperty(nombre, out var v) ? v.GetRawText() : null;
            }
        }

        /// <summary>Escribe un bloque de configuración completo a partir de su JSON en bruto.</summary>
        public void SetConfigRaw(string nombre, string rawJson)
        {
            string n = JsonSerializer.Serialize(nombre);
            string body = "{\"Name\":" + n + ",\"SessionID\":\"" + SessionStr + "\"," + n + ":" + rawJson + "}";
            using (var r = Request(Msg.ConfigSet, body)) CheckRet(r.RootElement);
        }

        // ------------------------------------------------------------ grabaciones de la SD

        /// <summary>
        /// Busca grabaciones en la SD entre dos fechas ("yyyy-MM-dd HH:mm:ss") y devuelve el array JSON
        /// <c>OPFileQuery</c> tal como lo manda la cámara (FileName, BeginTime, EndTime...) o "[]" si no hay.
        /// </summary>
        public string QueryFilesRaw(string begin, string end, int channel = 0, string type = "h264")
        {
            var cuerpo = new Dictionary<string, object>
            {
                ["Name"] = "OPFileQuery", ["SessionID"] = SessionStr,
                ["OPFileQuery"] = new Dictionary<string, object>
                {
                    ["BeginTime"] = begin, ["EndTime"] = end, ["Channel"] = channel,
                    ["DriverTypeMask"] = "0x0000FFFF", ["Event"] = "*", ["StreamType"] = "0x00000000", ["Type"] = type
                }
            };
            using (var r = Request(Msg.FileQuery, cuerpo))
            {
                CheckRet(r.RootElement);
                return r.RootElement.TryGetProperty("OPFileQuery", out var a) && a.ValueKind == JsonValueKind.Array ? a.GetRawText() : "[]";
            }
        }

        /// <summary>Cuerpo del mensaje OPPlayBack. <paramref name="accion"/>: Claim, DownloadStart o DownloadStop.</summary>
        private Dictionary<string, object> CuerpoPlayback(string accion, string fichero, string begin, string end) => new Dictionary<string, object>
        {
            ["Name"] = "OPPlayBack", ["SessionID"] = SessionStr,
            ["OPPlayBack"] = new Dictionary<string, object>
            {
                ["Action"] = accion, ["StartTime"] = begin, ["EndTime"] = end,
                ["Parameter"] = new Dictionary<string, object>
                {
                    ["PlayMode"] = "ByName", ["FileName"] = fichero, ["StreamType"] = 0, ["Value"] = 0, ["TransMode"] = "TCP"
                }
            }
        };

        /// <summary>
        /// Descarga un clip de la SD (formato propietario XM, sin convertir) entregando los bytes a <paramref name="alRecibir"/>
        /// hasta el fin del clip, <paramref name="maxBytes"/> o hasta que el callback devuelva false.
        /// Secuencia: Claim (1424) → DownloadStart (1420) → datos por 1426 → paquete vacío = fin → DownloadStop.
        /// La cámara solo atiende UNA descarga a la vez. Devuelve los bytes entregados.
        /// </summary>
        public long DescargarClip(string fichero, string begin, string end, Func<byte[], bool> alRecibir, long maxBytes = long.MaxValue)
        {
            Send(Msg.PbClaim, CuerpoPlayback("Claim", fichero, begin, end));
            try { for (int i = 0; i < 3; i++) if (ReadPacket().MsgId == Msg.PbClaim + 1) break; } catch (IOException) { }
            Send(Msg.PbCtrl, CuerpoPlayback("DownloadStart", fichero, begin, end));
            SetReadTimeout(8000);
            long total = 0;
            while (total < maxBytes)
            {
                Packet p;
                try { p = ReadPacket(); } catch (IOException) { break; }   // timeout o cierre = fin
                if (p.Body.Length == 0) break;                               // fin del clip
                if (p.Body[0] == (byte)'{') continue;                        // respuestas JSON de control
                total += p.Body.Length;
                if (!alRecibir(p.Body)) break;
            }
            try { Send(Msg.PbCtrl, CuerpoPlayback("DownloadStop", fichero, begin, end)); } catch (Exception) { }
            return total;
        }

        // ------------------------------------------------------------ PTZ

        /// <summary>
        /// Mensaje PTZ con espera de respuesta. Mover: <paramref name="preset"/> = <see cref="PtzStartValue"/>.
        /// Parar: el mismo comando con <see cref="PtzStopValue"/>. Presets: GotoPreset/SetPreset y nº de preset.
        /// </summary>
        public void Ptz(string command, int channel = 0, int step = 5, int preset = -1)
        {
            using (Request(Msg.Ptz, PtzMessage(command, channel, step, preset))) { }
        }

        /// <summary>Como <see cref="Ptz"/> pero SIN esperar la respuesta (no bloquea). <paramref name="stop"/> = parar.</summary>
        public void PtzSend(string command, int channel = 0, int step = 5, bool stop = false) =>
            Send(Msg.Ptz, PtzMessage(command, channel, step, stop ? PtzStopValue : PtzStartValue));

        private Dictionary<string, object> PtzMessage(string command, int channel, int step, int preset)
        {
            var p = new Dictionary<string, object>
            {
                ["AUX"] = new Dictionary<string, object> { ["Number"] = 0, ["Status"] = "On" },
                ["Channel"] = channel,
                ["MenuOpts"] = "Enter",
                ["POINT"] = new Dictionary<string, object> { ["bottom"] = 0, ["left"] = 0, ["right"] = 0, ["top"] = 0 },
                ["Pattern"] = "SetBegin",
                ["Preset"] = preset,
                ["Step"] = step,
                ["Tour"] = 0
            };
            var m = Base("OPPTZControl");
            m["OPPTZControl"] = new Dictionary<string, object> { ["Command"] = command, ["Parameter"] = p };
            return m;
        }

        // ------------------------------------------------------------ utilidades de paquete

        /// <summary>Construye un paquete completo: cabecera de 20 bytes (little-endian) + JSON terminado en "\n\0".</summary>
        public static byte[] BuildPacket(int session, int seq, int msgId, string json)
        {
            byte[] body = Encoding.UTF8.GetBytes(json + "\n");
            byte[] buf = new byte[20 + body.Length + 1];
            buf[0] = 0xFF;                                                      // marca
            BinaryPrimitives.WriteInt32LittleEndian(buf.AsSpan(4), session);    // 4-7 sesión
            BinaryPrimitives.WriteInt32LittleEndian(buf.AsSpan(8), seq);        // 8-11 nº de secuencia
            BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(14), (ushort)msgId); // 14-15 ID de mensaje
            BinaryPrimitives.WriteInt32LittleEndian(buf.AsSpan(16), body.Length + 1); // 16-19 longitud
            Buffer.BlockCopy(body, 0, buf, 20, body.Length);
            return buf;                                                         // último byte = 0
        }

        /// <summary>Lee un paquete de cualquier flujo.</summary>
        public static Packet ReadFrom(Stream inp)
        {
            byte[] h = new byte[20];
            ReadExactly(inp, h, 20);
            if (h[0] != 0xFF) throw new IOException("Cabecera XM inválida");
            int len = BinaryPrimitives.ReadInt32LittleEndian(h.AsSpan(16));
            if (len < 0 || len > 8000000) throw new IOException("Longitud inválida: " + len);
            byte[] body = new byte[len];
            ReadExactly(inp, body, len);
            return new Packet
            {
                Session = BinaryPrimitives.ReadInt32LittleEndian(h.AsSpan(4)),
                MsgId = BinaryPrimitives.ReadUInt16LittleEndian(h.AsSpan(14)),
                Body = body
            };
        }

        private static void ReadExactly(Stream s, byte[] buf, int count)
        {
            int off = 0;
            while (off < count)
            {
                int n = s.Read(buf, off, count - off);
                if (n <= 0) throw new IOException("Conexión cerrada por la cámara");
                off += n;
            }
        }

        // ------------------------------------------------------------ ayudas JSON

        /// <summary>Lee un entero de un JSON (admite número o texto); devuelve <paramref name="def"/> si no existe.</summary>
        public static int GetInt(JsonElement e, string nombre, int def)
        {
            if (!e.TryGetProperty(nombre, out var v)) return def;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out int n)) return n;
            if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out n)) return n;
            return def;
        }

        /// <summary>Lee un texto de un JSON; devuelve <paramref name="def"/> si no existe.</summary>
        public static string GetString(JsonElement e, string nombre, string def = "")
        {
            if (e.TryGetProperty(nombre, out var v) && v.ValueKind == JsonValueKind.String) return v.GetString();
            return def;
        }

        /// <summary>Convierte "0x0000001A" en entero (0 si no es válido).</summary>
        public static int ParseHex(string s)
        {
            if (s != null && s.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) s = s.Substring(2);
            return int.TryParse(s, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int v) ? v : 0;
        }
    }
}
