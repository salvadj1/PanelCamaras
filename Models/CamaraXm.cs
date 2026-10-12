using System;
using CentroSeguridad.Services.Xm;

namespace CentroSeguridad.Models
{
    /// <summary>Cámara XM/iCSee guardada por el usuario (contraseña en claro SOLO en memoria).</summary>
    public class CamaraXm
    {
        /// <summary>Identificador (32 hex). También se usa como prefijo del nombre de stream en go2rtc.</summary>
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Nombre { get; set; } = "";
        public string Host { get; set; } = "";
        public int Puerto { get; set; } = 34567;
        public string Usuario { get; set; } = "admin";
        public string Password { get; set; } = "";
        public int PuertoRtsp { get; set; } = 554;
        public int PuertoHttp { get; set; } = 80;
        public int Canal { get; set; } = 0;
        /// <summary>Algunos firmwares exigen el hash XM en la URL RTSP en lugar de la contraseña.</summary>
        public bool RtspHash { get; set; }

        /// <summary>URL RTSP. stream: 0 = principal (HD), 1 = secundario (SD).</summary>
        public string RtspUrl(int stream)
        {
            string pw = RtspHash ? XmCrypto.HashPassword(Password) : Password;
            return "rtsp://" + Host + ":" + PuertoRtsp + "/user=" + Usuario + "&password=" + pw +
                   "&channel=" + (Canal + 1) + "&stream=" + stream + ".sdp?real_stream";
        }

        /// <summary>URL de captura JPEG por HTTP.</summary>
        public string SnapshotUrl() =>
            "http://" + Host + ":" + PuertoHttp + "/webcapture.jpg?command=snap&channel=" + (Canal + 1) +
            "&user=" + Uri.EscapeDataString(Usuario) + "&password=" + Uri.EscapeDataString(XmCrypto.HashPassword(Password));
    }
}
