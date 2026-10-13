using System;
using System.IO;
using CentroSeguridad.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
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
                    // Escucha en todas las interfaces de red (no solo localhost):
                    //  - HTTP  7000: redirige a HTTPS a los equipos remotos.
                    //  - HTTPS 7001: necesario para WebCodecs (reproductor) en equipos remotos,
                    //    ya que los navegadores solo lo habilitan en contexto seguro.
                    // El certificado autofirmado se crea la primera vez junto al .exe (PanelCamaras.pfx).
                    webBuilder.ConfigureKestrel(k =>
                    {
                        k.ListenAnyIP(7000);
                        k.ListenAnyIP(7001, o => o.UseHttps(CertificadoAutofirmado.ObtenerOCrear(
                            Path.Combine(AppContext.BaseDirectory, "PanelCamaras.pfx"), "panelcamaras")));
                    });
                    webBuilder.UseStartup<Startup>();
                });
    }
}
