using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace CentroSeguridad.Services.Xm
{
    /// <summary>
    /// Diagnóstico de conexión paso a paso. Indica EN QUÉ CAPA falla: 1) puerto XM por TCP, 2) respuesta al login
    /// (sin respuesta / conexión cerrada / protocolo cifrado / credenciales / OK), 3) puertos HTTP, RTSP y ONVIF.
    /// Bloqueante: ejecutar en un hilo de fondo.
    /// </summary>
    public static class XmDiagnostics
    {
        /// <summary>Ejecuta el diagnóstico y devuelve las líneas de resultado.</summary>
        public static List<string> Run(string host, int port, string user, string password, int httpPort, int rtspPort)
        {
            var log = new List<string>();
            log.Add("Cámara " + host + " · puerto XM " + port + " · usuario \"" + user + "\"");
            var tcp = new TcpClient();
            bool conectado = false;
            var t0 = DateTime.UtcNow;
            try
            {
                var task = tcp.ConnectAsync(host, port);
                if (!task.Wait(4000))
                    log.Add("❌ 1. Puerto " + port + " sin respuesta (timeout). Revisa: IP correcta, misma red/subred, aislamiento de clientes en el router, VPN.");
                else
                {
                    conectado = true;
                    log.Add("✅ 1. Puerto " + port + " abierto (" + (int)(DateTime.UtcNow - t0).TotalMilliseconds + " ms)");
                }
            }
            catch (AggregateException ae)
            {
                var se = ae.InnerException as SocketException;
                if (se != null && se.SocketErrorCode == SocketError.ConnectionRefused)
                    log.Add("❌ 1. Puerto " + port + " RECHAZADO: la cámara está pero ese puerto está cerrado (no usa DVRIP ahí, o es solo-nube).");
                else if (se != null && (se.SocketErrorCode == SocketError.NetworkUnreachable || se.SocketErrorCode == SocketError.HostUnreachable))
                    log.Add("❌ 1. Sin ruta hasta " + host + ": red distinta.");
                else
                    log.Add("❌ 1. Error de conexión: " + (ae.InnerException != null ? ae.InnerException.Message : ae.Message));
            }
            if (conectado) PasoLogin(tcp, user, password, log);
            try { tcp.Close(); } catch (Exception) { }

            ComprobarPuerto(host, httpPort, "HTTP, capturas", log);
            SondaRtsp(host, rtspPort, log);
            ComprobarPuerto(host, 8899, "ONVIF", log);
            log.Add("— Fin del diagnóstico —");
            return log;
        }

        private static void PasoLogin(TcpClient tcp, string user, string password, List<string> log)
        {
            try
            {
                tcp.ReceiveTimeout = 4000;
                var s = tcp.GetStream();
                var req = new Dictionary<string, object>
                {
                    ["EncryptType"] = "MD5", ["LoginType"] = "DVRIP-Web",
                    ["PassWord"] = XmCrypto.HashPassword(password), ["UserName"] = user
                };
                byte[] pkt = DvripClient.BuildPacket(0, 0, Msg.Login, JsonSerializer.Serialize(req));
                s.Write(pkt, 0, pkt.Length);

                byte[] head = new byte[20];
                int got = 0;
                try
                {
                    while (got < 20) { int n = s.Read(head, got, 20 - got); if (n <= 0) break; got += n; }
                }
                catch (IOException)
                {
                    if (got == 0)
                    {
                        log.Add("❌ 2. Conecta pero NO responde al login (timeout). Puede ser otro servicio en ese puerto o firmware con protocolo cifrado.");
                        return;
                    }
                }
                if (got == 0)
                {
                    log.Add("❌ 2. La cámara CERRÓ la conexión al recibir el login. Causas: protocolo cifrado (firmware reciente), límite de sesiones, o no es DVRIP.");
                    return;
                }
                if (got < 20 || head[0] != 0xFF)
                {
                    log.Add("❌ 2. Respuesta no reconocible (bytes: " + Hex(head, got) + "). Típico de firmware reciente con protocolo CIFRADO.");
                    return;
                }
                int msg = BinaryPrimitives.ReadUInt16LittleEndian(head.AsSpan(14));
                int len = BinaryPrimitives.ReadInt32LittleEndian(head.AsSpan(16));
                if (len < 0 || len > 65536) { log.Add("❌ 2. Cabecera XM con longitud absurda (" + len + ")."); return; }
                byte[] body = new byte[len];
                int r = 0;
                try { while (r < len) { int n = s.Read(body, r, len - r); if (n <= 0) break; r += n; } } catch (IOException) { }
                JsonDocument json = null;
                try { json = JsonDocument.Parse(Encoding.UTF8.GetString(body, 0, r).Trim('\0', '\n', '\r', ' ', '\t')); } catch (JsonException) { }
                if (json == null)
                {
                    log.Add("❌ 2. Cabecera XM válida (mensaje " + msg + ") pero cuerpo ilegible (" + Hex(body, Math.Min(r, 24)) + "). Posible protocolo CIFRADO.");
                    return;
                }
                using (json)
                {
                    var root = json.RootElement;
                    int ret = DvripClient.GetInt(root, "Ret", -1);
                    if (RetCodes.EsOk(ret))
                        log.Add("✅ 2. Login correcto · tipo " + DvripClient.GetString(root, "DeviceType", "?") + " · canales " + DvripClient.GetInt(root, "ChannelNum", 1));
                    else
                    {
                        string pista = (ret == 106 || ret == 203 || ret == 205) ? " Revisa usuario y contraseña (los de la app iCSee)." : "";
                        log.Add("❌ 2. Login rechazado: " + RetCodes.Describir(ret) + " (Ret=" + ret + ")." + pista);
                    }
                }
            }
            catch (IOException e) { log.Add("❌ 2. Error durante el login: " + e.Message); }
        }

        private static void ComprobarPuerto(string host, int port, string nombre, List<string> log)
        {
            try
            {
                using (var t = new TcpClient())
                {
                    var task = t.ConnectAsync(host, port);
                    if (task.Wait(2000)) { log.Add("✅ 3. Puerto " + port + " (" + nombre + ") abierto"); return; }
                }
            }
            catch (AggregateException) { }
            log.Add("⚪ 3. Puerto " + port + " (" + nombre + ") cerrado o sin respuesta");
        }

        /// <summary>Envía un OPTIONS RTSP y muestra la primera línea de la respuesta.</summary>
        private static void SondaRtsp(string host, int port, List<string> log)
        {
            try
            {
                using (var t = new TcpClient())
                {
                    if (!t.ConnectAsync(host, port).Wait(2000)) throw new TimeoutException();
                    t.ReceiveTimeout = 2500;
                    var s = t.GetStream();
                    byte[] req = Encoding.ASCII.GetBytes("OPTIONS rtsp://" + host + ":" + port + "/ RTSP/1.0\r\nCSeq: 1\r\n\r\n");
                    s.Write(req, 0, req.Length);
                    byte[] buf = new byte[256];
                    int n = s.Read(buf, 0, buf.Length);
                    string primera = n > 0 ? Encoding.ASCII.GetString(buf, 0, n).Split('\n')[0].Trim() : "(sin datos)";
                    log.Add("✅ 3. RTSP " + port + " responde: " + primera);
                }
            }
            catch (Exception)
            {
                log.Add("⚪ 3. RTSP " + port + " no responde. Actívalo en la cámara si quieres vídeo en directo.");
            }
        }

        private static string Hex(byte[] b, int n)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < Math.Min(n, b.Length); i++) sb.Append(b[i].ToString("X2")).Append(' ');
            return sb.ToString().Trim();
        }
    }
}
