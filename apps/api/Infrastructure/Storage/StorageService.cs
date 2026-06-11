using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;

namespace Namokara.Api.Infrastructure.Storage;

public class StorageSettings
{
    public string Provider { get; set; } = "MinIO";
    public string Endpoint { get; set; } = "localhost:9000";
    public string AccessKey { get; set; } = "";
    public string SecretKey { get; set; } = "";
    public bool UseSsl { get; set; }
    public string BucketBills { get; set; } = "namokara-bills";
    public string BucketPhotos { get; set; } = "namokara-photos";
    public string BucketSelfies { get; set; } = "namokara-selfies";
    public string BucketDocs { get; set; } = "namokara-docs";
    /// <summary>Validity of presigned GET URLs (default 15 min). P0-15.</summary>
    public int PresignedUrlExpiryMinutes { get; set; } = 15;
    /// <summary>Max upload size in bytes (default 8 MB).</summary>
    public long MaxUploadBytes { get; set; } = 8 * 1024 * 1024;
}

public interface IStorageService
{
    /// <summary>Stores file and returns the OBJECT KEY (not URL). Use GetPresignedUrl to share.</summary>
    Task<string> UploadSelfie(IFormFile file, Guid firmId, Guid employeeId, string context);
    Task<string> UploadBillImage(IFormFile file, Guid firmId);
    Task<string> UploadSupplierPhoto(IFormFile file, Guid firmId, Guid supplierId);
    Task<string> UploadDocument(IFormFile file, Guid firmId, string subFolder);

    /// <summary>Generate a time-limited presigned GET URL for a stored object.</summary>
    Task<string> GetPresignedUrl(string bucket, string objectKey, int? expirySecondsOverride = null);
}

public class MinioStorageService : IStorageService
{
    private readonly IMinioClient _client;
    private readonly IOptionsMonitor<StorageSettings> _opts;
    private readonly ILogger<MinioStorageService> _log;

    /// <summary>P0-14: regex that strips anything other than [A-Z a-z 0-9 . _ -]</summary>
    private static readonly Regex UnsafeChars = new(@"[^a-zA-Z0-9._\-]", RegexOptions.Compiled);

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf",
        ".heic", ".heif"   // iPhone photos
    };

    public MinioStorageService(IOptionsMonitor<StorageSettings> opts, ILogger<MinioStorageService> log)
    {
        _opts = opts;
        _log = log;
        var s = opts.CurrentValue;
        _client = new MinioClient()
            .WithEndpoint(s.Endpoint)
            .WithCredentials(s.AccessKey, s.SecretKey)
            .WithSSL(s.UseSsl)
            .Build();
    }

    public Task<string> UploadSelfie(IFormFile file, Guid firmId, Guid employeeId, string context)
    {
        var bucket = _opts.CurrentValue.BucketSelfies;
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var safeContext = SafeSegment(context, fallback: "selfie");
        var objectName = $"{firmId}/{employeeId}/{date}/{safeContext}-{Guid.NewGuid()}.jpg";
        return Upload(file, bucket, objectName);
    }

    public Task<string> UploadBillImage(IFormFile file, Guid firmId)
    {
        var bucket = _opts.CurrentValue.BucketBills;
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var safeName = SafeFilename(file.FileName);
        var objectName = $"{firmId}/{date}/{Guid.NewGuid()}-{safeName}";
        return Upload(file, bucket, objectName);
    }

    public Task<string> UploadSupplierPhoto(IFormFile file, Guid firmId, Guid supplierId)
    {
        var bucket = _opts.CurrentValue.BucketPhotos;
        var safeName = SafeFilename(file.FileName);
        var objectName = $"{firmId}/{supplierId}/{Guid.NewGuid()}-{safeName}";
        return Upload(file, bucket, objectName);
    }

    public Task<string> UploadDocument(IFormFile file, Guid firmId, string subFolder)
    {
        var bucket = _opts.CurrentValue.BucketDocs;
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var safeFolder = SafeSegment(subFolder, fallback: "general");
        var safeName = SafeFilename(file.FileName);
        var objectName = $"{firmId}/{safeFolder}/{date}/{Guid.NewGuid()}-{safeName}";
        return Upload(file, bucket, objectName);
    }

    /// <summary>P0-15: Returns a time-limited presigned URL instead of a public URL.</summary>
    public async Task<string> GetPresignedUrl(string bucket, string objectKey, int? expirySecondsOverride = null)
    {
        var expirySec = expirySecondsOverride ?? (_opts.CurrentValue.PresignedUrlExpiryMinutes * 60);
        var args = new PresignedGetObjectArgs()
            .WithBucket(bucket)
            .WithObject(objectKey)
            .WithExpiry(expirySec);
        return await _client.PresignedGetObjectAsync(args);
    }

    /// <summary>
    /// P0-14: strip path separators, drop directory traversal, validate extension, limit length.
    /// </summary>
    private static string SafeFilename(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return "file";

        // Drop any path component the client may have sent
        var name = Path.GetFileName(fileName);

        // Strip unsafe chars
        name = UnsafeChars.Replace(name, "_");

        // Block files with no extension or disallowed extension
        var ext = Path.GetExtension(name).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext) || !AllowedExtensions.Contains(ext))
            throw new InvalidOperationException(
                $"File extension '{ext}' not allowed. Allowed: {string.Join(", ", AllowedExtensions)}");

        // Truncate name to 100 chars to keep keys reasonable
        if (name.Length > 100)
            name = name.Substring(0, 60) + "..." + name.Substring(name.Length - 30);

        return name;
    }

    /// <summary>For path segments (context names, folder names) — alphanum + underscore only.</summary>
    private static string SafeSegment(string raw, string fallback)
    {
        if (string.IsNullOrWhiteSpace(raw)) return fallback;
        var cleaned = UnsafeChars.Replace(raw, "_");
        if (cleaned.Length > 50) cleaned = cleaned.Substring(0, 50);
        return string.IsNullOrEmpty(cleaned) ? fallback : cleaned;
    }

    private async Task<string> Upload(IFormFile file, string bucket, string objectKey)
    {
        // Size validation
        if (file.Length > _opts.CurrentValue.MaxUploadBytes)
            throw new InvalidOperationException(
                $"File exceeds max size of {_opts.CurrentValue.MaxUploadBytes / 1024 / 1024} MB.");

        if (file.Length == 0)
            throw new InvalidOperationException("Empty file uploaded.");

        try
        {
            // Ensure bucket exists (PRIVATE — no anonymous policy)
            // Minio 6.x: BucketExistsAsync returns bool directly
            bool exists = await _client.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket));
            if (!exists)
            {
                await _client.MakeBucketAsync(new MakeBucketArgs().WithBucket(bucket));
            }

            using var stream = file.OpenReadStream();
            await _client.PutObjectAsync(new PutObjectArgs()
                .WithBucket(bucket)
                .WithObject(objectKey)
                .WithStreamData(stream)
                .WithObjectSize(file.Length)
                .WithContentType(file.ContentType ?? "application/octet-stream"));

            _log.LogInformation("MinIO upload OK: {Bucket}/{Object} ({Bytes} bytes)",
                bucket, objectKey, file.Length);

            // P0-15: return the OBJECT KEY (caller stores this in DB) — share via presigned URL.
            // Format: "bucket/objectKey" so consumers can decompose
            return $"{bucket}/{objectKey}";
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "MinIO upload failed: {Bucket}/{Object}", bucket, objectKey);
            throw;
        }
    }
}
