namespace CentroSeguridad.Models
{
    /// <summary>
    /// Describe una carpeta de grabaciones configurada en appsettings.json
    /// (sección "RutaDeGrabaciones"). Reutilizable como "origen de datos con nombre".
    /// </summary>
    public class RutaGrabacion
    {
        /// <summary>Nombre visible en el selector de la web (también es el identificador).</summary>
        public string Nombre { get; set; } = "";

        /// <summary>Ruta física: local (D:\Cam) o de red (\\NAS\cam). Vacía = se ignora.</summary>
        public string Ruta { get; set; } = "";
    }
}
