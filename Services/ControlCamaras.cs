using System;
using System.Threading.Tasks;
using CentroSeguridad.Services.Xm;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Ejecuta operaciones puntuales sobre una cámara (ajustes, hora, reinicio, info) abriendo una sesión
    /// DVRIP corta: login, operación y cierre. Reutilizable para cualquier orden que no sea movimiento continuo.
    /// </summary>
    public class ControlCamaras
    {
        private readonly AlmacenCamaras _almacen;

        public ControlCamaras(AlmacenCamaras almacen) { _almacen = almacen; }

        /// <summary>Abre sesión con la cámara <paramref name="id"/>, ejecuta <paramref name="operacion"/> y cierra.</summary>
        /// <exception cref="InvalidOperationException">Si la cámara no existe.</exception>
        public Task<T> EjecutarAsync<T>(string id, Func<DvripClient, T> operacion)
        {
            var cam = _almacen.Obtener(id) ?? throw new InvalidOperationException("Cámara no encontrada");
            return Task.Run(() =>
            {
                using (var c = new DvripClient(cam.Host, cam.Puerto))
                {
                    c.Login(cam.Usuario, cam.Password);
                    return operacion(c);
                }
            });
        }
    }
}
