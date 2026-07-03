using System.Globalization;
using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.MediaFoundation;
using NAudio.Wave;

namespace LacriTomato.Recording.WasapiLoopbackHelper;

internal static class Program
{
    private const string SupportedFormat = "s16le";

    private static async Task<int> Main(string[] args)
    {
        if (args.Contains("--help", StringComparer.OrdinalIgnoreCase) || args.Contains("-h", StringComparer.OrdinalIgnoreCase))
        {
            PrintUsage();
            return 0;
        }

        try
        {
            var options = HelperOptions.Parse(args);
            if (!OperatingSystem.IsWindows())
            {
                Console.Error.WriteLine("wasapi-loopback-helper 只能在 Windows 上运行。");
                return 2;
            }

            if (!string.Equals(options.Format, SupportedFormat, StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"不支持的输出格式：{options.Format}。当前只支持 {SupportedFormat}。");
                return 2;
            }

            await CaptureLoopbackAsync(options).ConfigureAwait(false);
            return 0;
        }
        catch (OperationCanceledException)
        {
            return 0;
        }
        catch (IOException)
        {
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.Message);
            return 1;
        }
    }

    private static async Task CaptureLoopbackAsync(HelperOptions options)
    {
        using var cancellation = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cancellation.Cancel();
        };

        MediaFoundationApi.Startup();
        try
        {
            using var deviceEnumerator = new MMDeviceEnumerator();
            using var device = deviceEnumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            using var capture = new WasapiLoopbackCapture(device);
            var outputFormat = new WaveFormat(options.Rate, 16, options.Channels);
            var bufferedInput = new BufferedWaveProvider(capture.WaveFormat)
            {
                BufferDuration = TimeSpan.FromSeconds(3),
                DiscardOnBufferOverflow = true,
            };
            using var resampler = new MediaFoundationResampler(bufferedInput, outputFormat)
            {
                ResamplerQuality = 60,
            };

            var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            capture.DataAvailable += (_, eventArgs) => bufferedInput.AddSamples(eventArgs.Buffer, 0, eventArgs.BytesRecorded);
            capture.RecordingStopped += (_, eventArgs) =>
            {
                if (eventArgs.Exception is not null)
                {
                    stopped.TrySetException(eventArgs.Exception);
                }
                else
                {
                    stopped.TrySetResult();
                }
            };

            await using var stdout = Console.OpenStandardOutput();
            var outputBuffer = new byte[CreateAlignedChunkSize(outputFormat, 50)];
            var stopwatch = Stopwatch.StartNew();
            long outputBytesWritten = 0;
            capture.StartRecording();

            try
            {
                while (!cancellation.IsCancellationRequested && !stopped.Task.IsCompleted)
                {
                    var bytesRead = resampler.Read(outputBuffer, 0, outputBuffer.Length);
                    if (bytesRead > 0)
                    {
                        await stdout.WriteAsync(outputBuffer.AsMemory(0, bytesRead), cancellation.Token).ConfigureAwait(false);
                        outputBytesWritten += bytesRead;
                        await DelayUntilRealtimeAsync(outputBytesWritten, outputFormat.AverageBytesPerSecond, stopwatch, cancellation.Token).ConfigureAwait(false);
                        continue;
                    }

                    await Task.Delay(5, cancellation.Token).ConfigureAwait(false);
                }
            }
            finally
            {
                if (!stopped.Task.IsCompleted)
                {
                    capture.StopRecording();
                }
            }

            await stopped.Task.ConfigureAwait(false);
        }
        finally
        {
            MediaFoundationApi.Shutdown();
        }
    }

    private static int CreateAlignedChunkSize(WaveFormat format, int chunksPerSecond)
    {
        var chunkSize = Math.Max(format.AverageBytesPerSecond / chunksPerSecond, format.BlockAlign);
        var remainder = chunkSize % format.BlockAlign;
        return remainder == 0 ? chunkSize : chunkSize + format.BlockAlign - remainder;
    }

    private static async Task DelayUntilRealtimeAsync(long outputBytesWritten, int averageBytesPerSecond, Stopwatch stopwatch, CancellationToken cancellationToken)
    {
        var targetElapsed = TimeSpan.FromSeconds((double)outputBytesWritten / averageBytesPerSecond);
        var delay = targetElapsed - stopwatch.Elapsed;
        if (delay > TimeSpan.Zero)
        {
            await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        }
    }

    private static void PrintUsage()
    {
        Console.Error.WriteLine("wasapi-loopback-helper --format s16le --rate 48000 --channels 2");
        Console.Error.WriteLine("将 Windows 默认播放设备的 WASAPI loopback 音频以 PCM s16le 写入 stdout。");
    }
}

internal sealed record HelperOptions(string Format, int Rate, int Channels)
{
    public static HelperOptions Parse(string[] args)
    {
        var format = ReadOption(args, "--format") ?? "s16le";
        var rate = ParsePositiveInt(ReadOption(args, "--rate"), 48000, "--rate");
        var channels = ParsePositiveInt(ReadOption(args, "--channels"), 2, "--channels");
        if (channels is < 1 or > 8)
        {
            throw new ArgumentException("--channels 必须在 1 到 8 之间。");
        }

        return new HelperOptions(format, rate, channels);
    }

    private static string? ReadOption(string[] args, string name)
    {
        for (var index = 0; index < args.Length; index += 1)
        {
            if (!string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (index + 1 >= args.Length)
            {
                throw new ArgumentException($"缺少 {name} 的值。");
            }

            return args[index + 1];
        }

        return null;
    }

    private static int ParsePositiveInt(string? value, int fallback, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) || parsed <= 0)
        {
            throw new ArgumentException($"{name} 必须是正整数。");
        }

        return parsed;
    }
}