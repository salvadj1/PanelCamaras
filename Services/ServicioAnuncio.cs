using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Anuncia el panel en la red local por SSDP/UPnP (UDP 1900): aparece en la pestaña "Red" del Explorador de Windows
    /// (descripción en /upnp.xml). Si el puerto UDP está ocupado o bloqueado, el anuncio se omite sin afectar al resto
    /// de la aplicación. Para entrar desde otros equipos se usa el nombre del PC o su IP (ver Ajustes → Red).
    /// </summary>
    public class ServicioAnuncio : BackgroundService
    {
        /// <summary>Puerto HTTPS de la aplicación (el que debe abrir quien encuentre el panel).</summary>
        public const int PuertoHttps = 7001;
        /// <summary>Identificador único estable del dispositivo (mismo valor tras cada reinicio de este equipo).</summary>
        public static readonly Guid Uuid = CrearUuid();

        private static readonly IPAddress GrupoSsdp = IPAddress.Parse("239.255.255.250");
        private readonly ILogger<ServicioAnuncio> _log;

        public ServicioAnuncio(ILogger<ServicioAnuncio> log) { _log = log; }

        private static Guid CrearUuid()
        {
            using (var md5 = MD5.Create())
                return new Guid(md5.ComputeHash(Encoding.UTF8.GetBytes("PanelCamaras|" + Environment.MachineName)));
        }

        /// <summary>IPv4 de las interfaces activas (sin loopback ni 169.254.x.x).</summary>
        public static List<IPAddress> IpsLocales()
        {
            var r = new List<IPAddress>();
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                    {
                        var a = ua.Address;
                        if (a.AddressFamily != AddressFamily.InterNetwork) continue;
                        var b = a.GetAddressBytes();
                        if (b[0] == 169 && b[1] == 254) continue;
                        r.Add(a);
                    }
                }
            }
            catch (Exception) { }
            return r;
        }

        /// <summary>IP local más parecida (mismo prefijo /24) a la de un equipo remoto; la primera si ninguna coincide.</summary>
        private static IPAddress IpPara(IPAddress remoto, List<IPAddress> locales)
        {
            var rb = remoto.GetAddressBytes();
            return locales.FirstOrDefault(l => { var b = l.GetAddressBytes(); return b[0] == rb[0] && b[1] == rb[1] && b[2] == rb[2]; }) ?? locales.FirstOrDefault();
        }

        protected override Task ExecuteAsync(CancellationToken stop) =>
            Task.Run(() => Ssdp(stop), stop);

        /// <summary>Abre un socket UDP compartido en <paramref name="puerto"/> y lo une al grupo multicast en todas las interfaces.</summary>
        private static UdpClient Abrir(int puerto, IPAddress grupo)
        {
            var u = new UdpClient(AddressFamily.InterNetwork);
            u.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            u.Client.Bind(new IPEndPoint(IPAddress.Any, puerto));
            foreach (var ip in IpsLocales()) { try { u.JoinMulticastGroup(grupo, ip); } catch (Exception) { } }
            return u;
        }

        // ------------------------------------------------------------------ SSDP / UPnP
        private async Task Ssdp(CancellationToken stop)
        {
            try
            {
                using (var u = Abrir(1900, GrupoSsdp))
                {
                    stop.Register(() => { try { u.Close(); } catch (Exception) { } });
                    var multicast = new IPEndPoint(GrupoSsdp, 1900);
                    _ = Task.Run(async () =>
                    {   // NOTIFY alive al arrancar y cada 5 min
                        while (!stop.IsCancellationRequested)
                        {
                            foreach (var ip in IpsLocales()) { var b = Mensaje("NOTIFY * HTTP/1.1", ip, "NT: upnp:rootdevice\r\nNTS: ssdp:alive\r\n", "NT"); try { u.Send(b, b.Length, multicast); } catch (Exception) { } }
                            try { await Task.Delay(TimeSpan.FromMinutes(5), stop); } catch (OperationCanceledException) { return; }
                        }
                    }, stop);
                    while (!stop.IsCancellationRequested)
                    {
                        var rx = await u.ReceiveAsync();
                        string t = Encoding.ASCII.GetString(rx.Buffer);
                        if (!t.StartsWith("M-SEARCH", StringComparison.OrdinalIgnoreCase)) continue;
                        if (!(t.Contains("ssdp:all") || t.Contains("upnp:rootdevice"))) continue;
                        var ip = IpPara(rx.RemoteEndPoint.Address, IpsLocales()); if (ip == null) continue;
                        var b = Mensaje("HTTP/1.1 200 OK", ip, "ST: upnp:rootdevice\r\n", "ST");
                        try { u.Send(b, b.Length, rx.RemoteEndPoint); } catch (Exception) { }
                    }
                }
            }
            catch (Exception e) when (!stop.IsCancellationRequested) { _log.LogInformation("SSDP no disponible: {Msg}", e.Message); }
            catch (Exception) { }
        }

        private static byte[] Mensaje(string primera, IPAddress ip, string tipo, string campo)
        {
            string usn = "uuid:" + Uuid + "::upnp:rootdevice";
            string s = primera + "\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://" + ip + ":7000/upnp.xml\r\nSERVER: PanelCamaras UPnP/1.0\r\n"
                     + (primera.StartsWith("NOTIFY") ? "HOST: 239.255.255.250:1900\r\n" : "EXT:\r\n") + tipo + "USN: " + usn + "\r\n\r\n";
            return Encoding.ASCII.GetBytes(s);
        }
    }
}
