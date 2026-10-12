using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;

namespace CentroSeguridad
{
    /// <summary>
    /// Punto de entrada de la aplicación. Configura y arranca el host web.
    /// Reutilizable: solo cambia la clase Startup si se copia a otro proyecto.
    /// </summary>
    public class Program
    {
        /// <summary>
        /// Método principal: construye el host y lo ejecuta.
        /// </summary>
        /// <param name="args">Argumentos de línea de comandos.</param>
        public static void Main(string[] args)
        {
            CreateHostBuilder(args).Build().Run();
        }

        /// <summary>
        /// Crea el generador del host con la configuración por defecto
        /// (Kestrel, appsettings, logging) y registra la clase Startup.
        /// Incluye soporte de Servicio de Windows: si la app se ejecuta como servicio
        /// ajusta la raíz de contenido al directorio del .exe y enlaza con el SCM;
        /// si se ejecuta desde VS o consola, se comporta como una app web normal.
        /// </summary>
        /// <param name="args">Argumentos de línea de comandos.</param>
        /// <returns>El IHostBuilder configurado.</returns>
        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .UseWindowsService() // permite ejecutar como Servicio de Windows
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    // Escucha en todas las interfaces de red (no solo localhost)
                    // para que otros equipos de la red local puedan acceder.
                    webBuilder.UseUrls("http://0.0.0.0:5000");
                    webBuilder.UseStartup<Startup>();
                });
    }
}
