using System;
using System.IO;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Genera y reutiliza un certificado HTTPS autofirmado (válido para localhost, el nombre del equipo
    /// y todas sus IP locales). Reutilizable en cualquier app Kestrel de red local.
    /// </summary>
    public static class CertificadoAutofirmado
    {
        /// <summary>
        /// Carga el certificado del archivo PFX; si no existe (o está dañado) lo crea y lo guarda.
        /// </summary>
        /// <param name="archivoPfx">Ruta del archivo .pfx donde se guarda/lee el certificado.</param>
        /// <param name="password">Contraseña del PFX.</param>
        /// <returns>Certificado listo para usar en Kestrel (clave privada persistente).</returns>
        public static X509Certificate2 ObtenerOCrear(string archivoPfx, string password)
        {
            if (File.Exists(archivoPfx))
            {
                try { return new X509Certificate2(archivoPfx, password); }
                catch (CryptographicException) { /* archivo dañado: se vuelve a generar */ }
            }
            byte[] pfx = CrearPfx(password);
            try { File.WriteAllBytes(archivoPfx, pfx); } catch (IOException) { /* sin permiso de escritura: solo en memoria */ }
            // Se recarga desde bytes para que la clave privada sea utilizable por SslStream en Windows.
            return new X509Certificate2(pfx, password);
        }

        /// <summary>
        /// Crea un certificado RSA 2048 autofirmado (10 años) con SAN de localhost, nombre del equipo e IPs locales.
        /// </summary>
        /// <param name="password">Contraseña con la que se exporta el PFX.</param>
        /// <returns>Contenido del PFX en bytes.</returns>
        private static byte[] CrearPfx(string password)
        {
            using (var rsa = RSA.Create(2048))
            {
                var req = new CertificateRequest("CN=PanelCamaras", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);

                var san = new SubjectAlternativeNameBuilder();
                san.AddDnsName("localhost");
                san.AddDnsName(Environment.MachineName);
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                        san.AddIpAddress(ua.Address);

                req.CertificateExtensions.Add(san.Build());
                req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, false));
                req.CertificateExtensions.Add(new X509KeyUsageExtension(
                    X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, false));
                req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(
                    new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, false)); // autenticación de servidor

                using (var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(10)))
                    return cert.Export(X509ContentType.Pfx, password);
            }
        }
    }
}
