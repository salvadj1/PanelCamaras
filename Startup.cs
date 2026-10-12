using Microsoft.AspNetCore.Builder;
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

            app.UseHttpsRedirection();
            app.UseStaticFiles(); // sirve wwwroot (css, js)
            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller=Home}/{action=Index}/{id?}");
            });
        }
    }
}
