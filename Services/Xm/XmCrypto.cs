using System.Security.Cryptography;
using System.Text;

namespace CentroSeguridad.Services.Xm
{
    /// <summary>Hash de contraseña propio de XM (reutilizable en cualquier cliente DVRIP).</summary>
    public static class XmCrypto
    {
        private const string Alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

        /// <summary>
        /// MD5 (16 bytes) -> se suman los bytes por parejas (8 sumas) -> cada suma módulo 62 -> carácter de
        /// 0-9, A-Z, a-z. Ejemplo verificado: contraseña vacía -> "tlJwpbo6".
        /// </summary>
        /// <param name="password">Contraseña en claro.</param>
        /// <returns>Hash de 8 caracteres.</returns>
        public static string HashPassword(string password)
        {
            using (var md5 = MD5.Create())
            {
                byte[] h = md5.ComputeHash(Encoding.UTF8.GetBytes(password ?? ""));
                var sb = new StringBuilder(8);
                for (int i = 0; i < 16; i += 2) sb.Append(Alfabeto[(h[i] + h[i + 1]) % 62]);
                return sb.ToString();
            }
        }
    }
}
