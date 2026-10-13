using System;

namespace CentroSeguridad.Services.Xm
{
    /// <summary>IDs de mensaje del protocolo XM (DVRIP/Sofia). La respuesta suele ser el ID de la petición + 1.</summary>
    public static class Msg
    {
        public const int Login = 1000, Logout = 1002, KeepAlive = 1006, SysInfo = 1020;
        public const int ConfigSet = 1040, ConfigGet = 1042, Ability = 1360, Ptz = 1400;
        public const int PbCtrl = 1420, PbClaim = 1424, PbData = 1426, FileQuery = 1440, Machine = 1450, TimeQuery = 1452;
        public const int AlarmSub = 1500, AlarmPush = 1504, Discover = 1530, Snap = 1560, TimeSet = 1590;
    }

    /// <summary>Comandos PTZ del mensaje OPPTZControl.</summary>
    public static class PtzCmd
    {
        public const string Up = "DirectionUp", Down = "DirectionDown", Left = "DirectionLeft", Right = "DirectionRight";
        public const string LeftUp = "DirectionLeftUp", LeftDown = "DirectionLeftDown";
        public const string RightUp = "DirectionRightUp", RightDown = "DirectionRightDown";
        public const string ZoomIn = "ZoomTile", ZoomOut = "ZoomWide";
        public const string FocusNear = "FocusNear", FocusFar = "FocusFar";
        public const string GotoPreset = "GotoPreset", SetPreset = "SetPreset";

        /// <summary>Comandos de movimiento continuo aceptados desde la web.</summary>
        public static readonly string[] Movimiento =
        {
            Up, Down, Left, Right, LeftUp, LeftDown, RightUp, RightDown, ZoomIn, ZoomOut, FocusNear, FocusFar
        };
    }

    /// <summary>Descripción de los códigos <c>Ret</c> más habituales de la cámara.</summary>
    public static class RetCodes
    {
        /// <summary>true si el código indica éxito.</summary>
        public static bool EsOk(int ret) => ret == 100 || ret == 515 || ret == 603;

        /// <summary>Texto en español de un código <c>Ret</c>.</summary>
        public static string Describir(int ret)
        {
            switch (ret)
            {
                case 100: return "OK";
                case 101: return "Error desconocido";
                case 103: return "Petición ilegal";
                case 105: return "Usuario no conectado";
                case 106: return "Usuario o contraseña incorrectos";
                case 107: return "Sin permiso";
                case 108: return "Timeout";
                case 203: return "Contraseña incorrecta";
                case 205: return "Usuario inexistente";
                default: return "Código " + ret;
            }
        }
    }

    /// <summary>Error del protocolo (login fallido, <c>Ret</c> distinto de OK...).</summary>
    public class XmException : Exception
    {
        /// <summary>Código <c>Ret</c> devuelto por la cámara (0 si no aplica).</summary>
        public int Ret { get; }

        public XmException(string mensaje, int ret = 0) : base(mensaje) { Ret = ret; }
    }
}
