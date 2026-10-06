import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, FileAudio, AlertCircle, RefreshCw, Video } from 'lucide-react';
import { blobToRawBase64, normalizeMediaMime } from '../utils/mediaUtils';

interface AudioRecorderProps {
  onAudioReady: (rawBase64: string, mimeType: string, fileName?: string) => void;
  disabled?: boolean;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioReady, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isVideoFile, setIsVideoFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setErrorMsg(null);
    setAudioUrl(null);
    setSelectedFile(null);
    setIsVideoFile(false);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('المتصفح الحالي لا يدعم تسجيل الصوت عبر الميكروفون.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const actualMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        
        // Preview URL strictly for the HTML audio element
        const previewUrl = URL.createObjectURL(blob);
        setAudioUrl(previewUrl);
        setIsVideoFile(false);

        // Convert Blob directly to raw Base64 bytes (no data URL prefix)
        try {
          const rawBase64 = await blobToRawBase64(blob);
          const { mimeType: normalizedMime } = normalizeMediaMime(actualMime);
          onAudioReady(rawBase64, normalizedMime, 'تسجيل ميكروفون مباشر');
        } catch (convErr: any) {
          console.error('[MIHAK Audio] Failed to convert recording to base64:', convErr);
          setErrorMsg('تعذر معالجة التسجيل الصوتي. يرجى إعادة المحاولة.');
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      recorder.start(250); // collect every 250ms
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[MIHAK Audio] Microphone error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('تم رفض إذن الوصول للميكروفون. يرجى تفعيل الإذن من إعدادات المتصفح.');
      } else {
        setErrorMsg(err?.message || 'تعذر تشغيل الميكروفون للتسجيل.');
      }
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      setErrorMsg('الملف المختار فارغ. يرجى اختيار ملف وسائط صالح.');
      return;
    }

    // Check size limit: max 25MB
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('حجم الملف كبير جدًا. الحد الأقصى المسموح به هو 25 ميجابايت.');
      return;
    }

    const { mimeType: normalizedMime, isVideo } = normalizeMediaMime(file.type, file.name);
    setSelectedFile(file);
    setIsVideoFile(isVideo);

    // Set preview URL for HTML playback
    const previewUrl = URL.createObjectURL(file);
    setAudioUrl(previewUrl);

    // Read directly from File ArrayBuffer -> pure raw Base64 (NO Data URL prefix)
    try {
      const rawBase64 = await blobToRawBase64(file);
      onAudioReady(rawBase64, normalizedMime, file.name);
    } catch (convErr: any) {
      console.error('[MIHAK Media] Failed to read uploaded file:', convErr);
      setErrorMsg('تعذر قراءة بيانات الملف المرفوع. يرجى التأكد من سلامة الملف.');
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleReset = () => {
    if (isRecording) stopRecording();
    setAudioUrl(null);
    setSelectedFile(null);
    setIsVideoFile(false);
    setErrorMsg(null);
    setRecordingTime(0);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Option 1: Live Microphone Recording */}
        <div className="rounded-2xl border border-white/10 bg-[#090D24] p-5 flex flex-col items-center justify-center text-center space-y-3">
          <div className="relative">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                isRecording
                  ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_25px_rgba(244,63,94,0.5)]'
                  : 'bg-[#2EF2C2]/15 text-[#2EF2C2] hover:bg-[#2EF2C2]/25 border border-[#2EF2C2]/40 hover:scale-105'
              }`}
              title={isRecording ? 'إيقاف التسجيل' : 'بدء تسجيل مباشر'}
            >
              {isRecording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-7 h-7" />}
            </button>
            {isRecording && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
              </span>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-white">
              {isRecording ? 'جاري التسجيل الآن...' : 'تسجيل صوتي مباشر'}
            </p>
            <p className="text-xs text-slate-400 font-mono">
              {isRecording ? formatTimer(recordingTime) : 'انقر على الميكروفون للتحدث'}
            </p>
          </div>
        </div>

        {/* Option 2: Upload File */}
        <div className="rounded-2xl border border-white/10 bg-[#090D24] p-5 flex flex-col items-center justify-center text-center space-y-3 relative group hover:border-[#2EF2C2]/30 transition">
          <input
            type="file"
            accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.aac,.flac"
            onChange={handleFileUpload}
            disabled={disabled || isRecording}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-400/30 flex items-center justify-center text-indigo-300 group-hover:scale-105 transition">
            <Upload className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-white">
              {selectedFile ? selectedFile.name : 'رفع ملف صوتي أو فيديو'}
            </p>
            <p className="text-xs text-slate-400">
              يدعم MP3, WAV, M4A, WEBM, MP4 (حتى 25 ميجابايت)
            </p>
          </div>
        </div>
      </div>

      {/* Media playback preview */}
      {audioUrl && (
        <div className="rounded-xl border border-[#2EF2C2]/20 bg-[#2EF2C2]/5 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#2EF2C2] font-semibold">
            {isVideoFile ? <Video className="w-4 h-4" /> : <FileAudio className="w-4 h-4" />}
            <span>
              {selectedFile ? selectedFile.name : 'تم تسجيل المقطع الصوتي بنجاح'}
              {isVideoFile ? ' (مقطع فيديو - سيتم تفريغ المحتوى المنطوق)' : ''}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isVideoFile ? (
              <video src={audioUrl} controls className="h-24 max-w-full rounded-lg" />
            ) : (
              <audio src={audioUrl} controls className="h-9 w-full sm:w-64 max-w-full" />
            )}
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-white p-1 rounded transition"
              title="إعادة ضبط المقطع"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
