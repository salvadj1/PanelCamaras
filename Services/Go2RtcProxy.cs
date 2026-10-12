using System;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Proxy WebSocket <c>/live/ws?src=NOMBRE</c> hacia go2rtc (127.0.0.1:1984). Así el navegador usa la misma
    /// URL segura (wss) de la página, sin abrir más puertos ni mezclar contenido HTTP/HTTPS.
    /// </summary>
    public static class Go2RtcProxy
    {
        /// <summary>Registra el proxy en el pipeline (antes de UseRouting).</summary>
        public static IApplicationBuilder UsarProxyLive(this IApplicationBuilder app)
        {
            app.UseWebSockets();
            app.Map("/live/ws", rama => rama.Run(Reenviar));
            return app;
        }

        private static async Task Reenviar(HttpContext ctx)
        {
            var go2rtc = ctx.RequestServices.GetRequiredService<Go2RtcService>();
            string src = ctx.Request.Query["src"].ToString();
            if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
            if (!go2rtc.Disponible || !go2rtc.StreamValido(src)) { ctx.Response.StatusCode = 404; return; }

            using (var cliente = await ctx.WebSockets.AcceptWebSocketAsync())
            using (var arriba = new ClientWebSocket())
            using (var cts = CancellationTokenSource.CreateLinkedTokenSource(ctx.RequestAborted))
            {
                try
                {
                    await arriba.ConnectAsync(new Uri("ws://127.0.0.1:" + Go2RtcService.PuertoApi + "/api/ws?src=" + Uri.EscapeDataString(src)), cts.Token);
                    await Task.WhenAny(Bombear(cliente, arriba, cts.Token), Bombear(arriba, cliente, cts.Token));
                }
                catch (Exception) { /* cierre brusco de uno de los lados */ }
                finally
                {
                    cts.Cancel();
                    try { if (cliente.State == WebSocketState.Open) await cliente.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None); } catch (Exception) { }
                }
            }
        }

        /// <summary>Copia mensajes de un WebSocket a otro hasta que uno se cierra.</summary>
        private static async Task Bombear(WebSocket origen, WebSocket destino, CancellationToken ct)
        {
            var buf = new byte[64 * 1024];
            try
            {
                while (origen.State == WebSocketState.Open && destino.State == WebSocketState.Open)
                {
                    var r = await origen.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                    if (r.MessageType == WebSocketMessageType.Close) break;
                    await destino.SendAsync(new ArraySegment<byte>(buf, 0, r.Count), r.MessageType, r.EndOfMessage, ct);
                }
            }
            catch (Exception) { /* uno de los dos lados se cerró */ }
        }
    }
}
