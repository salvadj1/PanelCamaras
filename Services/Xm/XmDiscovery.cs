using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Globalization;

namespace CentroSeguridad.Services.Xm
{
    /// <summary>Descubrimiento de cámaras XM en la red local (broadcast UDP al puerto 34569, mensaje 1530).</summary>
    public static class XmDiscovery
    {
        private const int Puerto = 34569;

        /// <summary>Cámara encontrada en la red.</summary>
        public sealed class Found
        {
            public string Ip { get; set; }
            public string Nombre { get; set; }
            public string Mac { get; set; }
            public string Serie { get; set; }
            public int PuertoTcp { get; set; }
            public int PuertoHttp { get; set; }
        }

        /// <summary>
        /// Escanea la LAN durante <paramref name="timeoutMs"/> ms. Bloqueante.
        /// Las cámaras responden al puerto UDP 34569 (no al de origen), por eso el socket se enlaza a ese puerto
        /// ANTES de enviar. La petición se repite cada segundo porque UDP puede perderse.
        /// </summary>
        public static List<Found> Scan(int timeoutMs = 4000)
        {
            var result = new Dictionary<string, Found>();
            using (var s = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp))
            {
                s.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                s.Bind(new IPEndPoint(IPAddress.Any, Puerto));
                s.EnableBroadcast = true;
                s.ReceiveTimeout = 300;
                // Windows: evita que un ICMP "puerto inaccesible" haga fallar la recepción (WSAECONNRESET).
                try { s.IOControl((IOControlCode)(-1744830452), new byte[] { 0 }, null); } catch (Exception) { /* no es Windows */ }

                byte[] req = Peticion();
                var destinos = Broadcasts();
                byte[] buf = new byte[4096];
                var inicio = DateTime.UtcNow;
                var ultimoEnvio = DateTime.MinValue;

                while ((DateTime.UtcNow - inicio).TotalMilliseconds < timeoutMs)
                {
                    if ((DateTime.UtcNow - ultimoEnvio).TotalMilliseconds >= 1000)
                    {
                        foreach (var d in destinos)
                        {
                            try { s.SendTo(req, new IPEndPoint(d, Puerto)); } catch (SocketException) { /* interfaz sin salida */ }
                        }
                        ultimoEnvio = DateTime.UtcNow;
                    }
                    try
                    {
                        EndPoint ep = new IPEndPoint(IPAddress.Any, 0);
                        int n = s.ReceiveFrom(buf, ref ep);
                        if (n <= 20) continue; // nuestro propio broadcast u otro paquete sin cuerpo
                        var f = Interpretar(Encoding.UTF8.GetString(buf, 20, n - 20));
                        if (f != null) result[f.Ip] = f;
                    }
                    catch (SocketException se) when (se.SocketErrorCode == SocketError.TimedOut || se.SocketErrorCode == SocketError.ConnectionReset)
                    {
                        // nada recibido en este intervalo: seguimos esperando
                    }
                }
            }
            return result.Values.ToList();
        }

        /// <summary>Convierte la respuesta JSON de una cámara en un <see cref="Found"/> (null si no es de XM).</summary>
        private static Found Interpretar(string texto)
        {
            try
            {
                using (var doc = JsonDocument.Parse(texto.Trim('\0', '\n', '\r', ' ', '\t')))
                {
                    if (!doc.RootElement.TryGetProperty("NetWork.NetCommon", out var nc)) return null;
                    // HostIP viene como hex little-endian: "0x0A01A8C0" -> 192.168.1.10
                    string hex = DvripClient.GetString(nc, "HostIP");
                    if (hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) hex = hex.Substring(2);
                    if (!uint.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out uint v)) return null;
                    string ip = (v & 0xFF) + "." + ((v >> 8) & 0xFF) + "." + ((v >> 16) & 0xFF) + "." + ((v >> 24) & 0xFF);
                    string serie = DvripClient.GetString(nc, "SN", DvripClient.GetString(nc, "SerialNo"));
                    return new Found
                    {
                        Ip = ip,
                        Nombre = DvripClient.GetString(nc, "HostName", "Cámara"),
                        Mac = DvripClient.GetString(nc, "MAC"),
                        Serie = serie,
                        PuertoTcp = DvripClient.GetInt(nc, "TCPPort", 34567),
                        PuertoHttp = DvripClient.GetInt(nc, "HttpPort", 80)
                    };
                }
            }
            catch (JsonException) { return null; } // paquete ajeno al protocolo XM
        }

        /// <summary>Petición de descubrimiento: cabecera XM con mensaje 1530 y sin cuerpo.</summary>
        private static byte[] Peticion()
        {
            byte[] h = new byte[20];
            h[0] = 0xFF;
            h[14] = (byte)(Msg.Discover & 0xFF);
            h[15] = (byte)(Msg.Discover >> 8);
            return h;
        }

        /// <summary>Broadcast global + broadcast de cada subred IPv4 local.</summary>
        private static List<IPAddress> Broadcasts()
        {
            var lista = new List<IPAddress> { IPAddress.Broadcast };
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily != AddressFamily.InterNetwork || ua.IPv4Mask == null) continue;
                        byte[] ip = ua.Address.GetAddressBytes(), m = ua.IPv4Mask.GetAddressBytes(), b = new byte[4];
                        for (int i = 0; i < 4; i++) b[i] = (byte)(ip[i] | ~m[i]);
                        var bc = new IPAddress(b);
                        if (!lista.Contains(bc)) lista.Add(bc);
                    }
                }
            }
            catch (Exception) { /* sin acceso a interfaces: nos quedamos con el global */ }
            return lista;
        }
    }
}
