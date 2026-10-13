using System;
using System.Collections.Generic;
using System.Text.Json;

namespace CentroSeguridad.Services.Alarmas
{
    /// <summary>Tipos de acción que puede ejecutar una regla en el servidor.</summary>
    public static class TipoAccion
    {
        public const string Notificar = "NOTIFY", Foto = "SNAPSHOT", HttpGet = "HTTP_GET", PtzPreset = "PTZ_PRESET";
    }

    /// <summary>Acción de una regla; Param es la URL (HTTP_GET) o el nº de preset (PTZ_PRESET).</summary>
    public class Accion
    {
        public string Tipo { get; set; } = "";
        public string Param { get; set; } = "";
    }

    /// <summary>
    /// Regla: "cuando ocurra [Eventos] en [CamaraId] bajo estas condiciones, ejecuta [Acciones]".
    /// Vacío = sin restricción (CamaraId "" = todas, Perfil "" = cualquiera, Desde/Hasta &lt; 0 = siempre).
    /// </summary>
    public class Regla
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Nombre { get; set; } = "Nueva regla";
        public bool Activa { get; set; } = true;
        public string CamaraId { get; set; } = "";
        public List<string> Eventos { get; set; } = new List<string> { "*" };
        public bool SoloInicio { get; set; } = true;
        public int Desde { get; set; } = -1;
        public int Hasta { get; set; } = -1;
        public string Perfil { get; set; } = "";
        public int EsperaSeg { get; set; } = 30;
        public List<Accion> Acciones { get; set; } = new List<Accion>();
    }

    /// <summary>Entrada del historial de eventos.</summary>
    public class EventoRec
    {
        public long Id { get; set; }
        public long Hora { get; set; }            // ms desde 1970 (UTC)
        public string CamaraId { get; set; } = "";
        public string Camara { get; set; } = "";
        public string Evento { get; set; } = "";
        public string Estado { get; set; } = "";
        public string Foto { get; set; }          // nombre de archivo en datos/snaps (null si no hay)
        public bool Notificar { get; set; }       // true si alguna regla pidió avisar en el navegador
    }

    /// <summary>Alarma ya interpretada (viene por sesión DVRIP 1504 o empujada al puerto 15002).</summary>
    public class AlarmaEvento
    {
        public string Evento = "", Estado = "Start", Hora = "";
        public int Canal;

        /// <summary>Interpreta el JSON de una alarma; devuelve null si no contiene "Event".</summary>
        public static AlarmaEvento Interpretar(JsonElement json)
        {
            JsonElement a = json;
            if (json.ValueKind == JsonValueKind.Object && json.TryGetProperty("AlarmInfo", out var info) && info.ValueKind == JsonValueKind.Object) a = info;
            if (a.ValueKind != JsonValueKind.Object) return null;
            string ev = Xm.DvripClient.GetString(a, "Event");
            if (string.IsNullOrEmpty(ev)) return null;
            return new AlarmaEvento
            {
                Evento = ev,
                Estado = Xm.DvripClient.GetString(a, "Status", "Start"),
                Canal = Xm.DvripClient.GetInt(a, "Channel", 0),
                Hora = Xm.DvripClient.GetString(a, "StartTime")
            };
        }
    }

    /// <summary>Etiquetas en español de los eventos de la cámara.</summary>
    public static class Eventos
    {
        public static readonly (string Clave, string Texto)[] Lista =
        {
            ("VideoMotion", "Movimiento"), ("HumanDetect", "Persona"), ("VideoBlind", "Cámara tapada"),
            ("VideoLoss", "Pérdida de vídeo"), ("StorageNotExist", "SD no encontrada"), ("StorageFailure", "Fallo de SD"),
            ("StorageLowSpace", "SD casi llena"), ("NetAbort", "Red caída"), ("IPConflict", "Conflicto de IP")
        };
        public static string Etiqueta(string ev)
        {
            foreach (var e in Lista) if (e.Clave == ev) return e.Texto;
            return ev;
        }
    }
}
