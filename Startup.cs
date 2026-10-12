using System;
using System.IO;
using System.Linq;
using CentroSeguridad.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CentroSeguridad
{
    /// <summary>
    /// Configura servicios y pipeline HTTP de la aplicación MVC.
    /// Plantilla mínima reutilizable en cualquier app ASP.NET Core 5 con MVC.
    /// </summary>
    public class Startup
    {
        /// <summary>
        /// Registra los servicios en el contenedor de inyección de dependencias.
        /// </summary>
        /// <param name="services">Colección de servicios de la aplicación.</param>
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllersWithViews();
            services.AddSingleton<AlmacenGrabaciones>(); // lee RutaDeGrabaciones de appsettings.json

            // Cámaras XM: contraseñas cifradas con Data Protection (claves en datos/keys, protegidas con DPAPI).
            services.AddDataProtection()
                .SetApplicationName("PanelCamaras")
                .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(AppContext.BaseDirectory, "datos", "keys")))
                .ProtectKeysWithDpapi(protectToLocalMachine: true);
            services.AddSingleton<AlmacenCamaras>();
            services.AddSingleton<PtzService>();
            services.AddSingleton<ControlCamaras>();
            services.AddSingleton<CentroSeguridad.Services.Alarmas.AlmacenReglas>();
            services.AddSingleton<CentroSeguridad.Services.Alarmas.MotorReglas>();
            services.AddSingleton<CentroSeguridad.Services.Alarmas.ServicioAlarmas>();
            services.AddHostedService(sp => sp.GetRequiredService<CentroSeguridad.Services.Alarmas.ServicioAlarmas>());
            services.AddSingleton<EstadoCamaras>();
            services.AddHostedService(sp => sp.GetRequiredService<EstadoCamaras>());
            services.AddSingleton<Go2RtcService>();
            services.AddHostedService(sp => sp.GetRequiredService<Go2RtcService>());
        }

        /// <summary>
        /// Define el pipeline de middleware: errores, archivos estáticos y rutas MVC.
        /// </summary>
        /// <param name="app">Constructor del pipeline de la aplicación.</param>
        /// <param name="env">Información del entorno (Development, Production...).</param>
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Home/Error");
                app.UseHsts();
            }

            // Equipos remotos por HTTP (7000): se envían a /acceso, que comprueba si el navegador confía en el
            // certificado HTTPS (7001). Si confía, redirige; si no, ofrece instalarlo. WebCodecs (reproductor)
            // solo funciona en contexto seguro. En localhost se deja HTTP, que ya es contexto seguro.
            var abiertas = new[] { "/acceso", "/ping", "/certificado.crt", "/instalar-certificado.bat" };
            app.Use(async (ctx, next) =>
            {
                var host = ctx.Request.Host.Host;
                bool local = host == "localhost" || host == "127.0.0.1" || host == "[::1]";
                if (ctx.Request.IsHttps || local || abiertas.Contains(ctx.Request.Path.Value.ToLowerInvariant()))
                    await next();
                else
                    ctx.Response.Redirect("/acceso?ret=" + System.Uri.EscapeDataString(ctx.Request.Path + ctx.Request.QueryString.Value));
            });
            app.UsarProxyLive();  // /live/ws -> go2rtc (vídeo en directo)
            app.UseStaticFiles(); // sirve wwwroot (css, js)
            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers(); // rutas por atributo: /, /camara/{id}, /grabaciones, /api/...
            });
        }
    }
}
