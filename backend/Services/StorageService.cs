using Amazon.S3;
using Amazon.S3.Model;
using StackExchange.Redis;

namespace Api.Services;

public interface IStorageService
{
    Task<string> UploadPdfAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default);
    Task<(Stream Stream, string ContentType, string FileName)> DownloadAsync(string objectName, CancellationToken ct = default);
    Task<bool> ExistsAsync(string objectName, CancellationToken ct = default);
}

public class StorageService : IStorageService
{
    private readonly IAmazonS3 _s3Client;
    private readonly ConnectionMultiplexer _redis;
    private readonly ILogger<StorageService> _logger;
    private readonly string _bucket;

    public StorageService(IConfiguration configuration, ILogger<StorageService> logger)
    {
        _logger = logger;
        var endpoint = configuration["Minio:Endpoint"] ?? "minio:9000";
        var accessKey = configuration["Minio:AccessKey"] ?? "minioadmin";
        var secretKey = configuration["Minio:SecretKey"] ?? "minioadmin";
        _bucket = configuration["Minio:Bucket"] ?? "usermgmt";

        var config = new AmazonS3Config
        {
            ServiceURL = $"http://{endpoint}",
            ForcePathStyle = true
        };

        _s3Client = new AmazonS3Client(accessKey, secretKey, config);

        var redisHost = configuration["Redis:Host"] ?? "redis";
        var redisPort = configuration["Redis:Port"] ?? "6379";
        _redis = ConnectionMultiplexer.Connect($"{redisHost}:{redisPort}");
    }

    public async Task<string> UploadPdfAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default)
    {
        await EnsureBucketExistsAsync(ct);

        var safeFileName = SanitizeFileName(fileName);
        var objectName = $"documents/{Guid.NewGuid():N}/{safeFileName}";
        var request = new PutObjectRequest
        {
            BucketName = _bucket,
            Key = objectName,
            ContentType = contentType,
            InputStream = fileStream,
            CannedACL = S3CannedACL.Private
        };

        await _s3Client.PutObjectAsync(request, ct);

        var db = _redis.GetDatabase();
        await db.StringSetAsync($"file:{objectName}", objectName, TimeSpan.FromHours(6));

        var encodedKey = Uri.EscapeDataString(objectName);
        var publicUrl = $"/api/memoires/file?key={encodedKey}";
        _logger.LogInformation("Fichier uploadé dans MinIO: {ObjectName}", objectName);
        return publicUrl;
    }

    public async Task<(Stream Stream, string ContentType, string FileName)> DownloadAsync(string objectName, CancellationToken ct = default)
    {
        var response = await _s3Client.GetObjectAsync(_bucket, objectName, ct);
        return (response.ResponseStream, response.Headers.ContentType ?? "application/octet-stream", Path.GetFileName(objectName));
    }

    public async Task<bool> ExistsAsync(string objectName, CancellationToken ct = default)
    {
        try
        {
            await _s3Client.GetObjectMetadataAsync(_bucket, objectName, ct);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task EnsureBucketExistsAsync(CancellationToken ct)
    {
        var found = await _s3Client.DoesS3BucketExistAsync(_bucket);
        if (!found)
        {
            await _s3Client.PutBucketAsync(_bucket);
        }
    }

    private static string SanitizeFileName(string fileName)
    {
        var safeName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(safeName))
        {
            return "document.pdf";
        }

        return safeName.Replace(" ", "_");
    }
}
