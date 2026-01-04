
import React, { useState, useRef } from 'react';
import { analyzeAudioChapters } from './services/geminiService';
import { decodeAudio, sliceAudioBuffer, encodeAudioBuffer, formatTime } from './utils/audioProcessing';
import { SlicedChapter, ProcessingState } from './types';
import { 
  FileAudio, 
  Upload, 
  Scissors, 
  Download, 
  Play, 
  Pause, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  X,
  Volume2,
  Settings2,
  Zap,
  Clock
} from 'lucide-react';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<'wav' | 'mp3'>('wav');
  const [chapters, setChapters] = useState<SlicedChapter[]>([]);
  const [status, setStatus] = useState<ProcessingState>({
    isUploading: false,
    isAnalyzing: false,
    isSlicing: false,
    error: null,
    progress: 0
  });
  
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setChapters([]);
      setStatus(prev => ({ ...prev, error: null }));
    }
  };

  const processAudio = async () => {
    if (!file) return;

    try {
      setStatus({ ...status, isAnalyzing: true, error: null });
      
      // 1. Analyze with Gemini
      const detectedMarkers = await analyzeAudioChapters(file);
      
      if (detectedMarkers.length === 0) {
        throw new Error("No chapter markers detected in this audio.");
      }

      // 2. Prepare slicing structures
      const slicedChapters: SlicedChapter[] = detectedMarkers.map((marker, idx) => {
        const endTime = detectedMarkers[idx + 1] 
          ? detectedMarkers[idx + 1].start_time_seconds 
          : undefined;
        
        return {
          id: Math.random().toString(36).substr(2, 9),
          title: marker.title,
          start_time_seconds: marker.start_time_seconds,
          end_time_seconds: endTime,
          status: 'pending'
        };
      });

      setChapters(slicedChapters);
      setStatus(prev => ({ ...prev, isAnalyzing: false, isSlicing: true }));

      // 3. Decode full audio for slicing
      const fullAudioBuffer = await decodeAudio(file);
      
      // Update last chapter end time
      const finalChapters = [...slicedChapters];
      finalChapters[finalChapters.length - 1].end_time_seconds = fullAudioBuffer.duration;

      // 4. Perform slicing and encoding in the user-selected format
      const processedChapters: SlicedChapter[] = [];
      const mimeType = outputFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      
      for (let i = 0; i < finalChapters.length; i++) {
        const chapter = finalChapters[i];
        const start = chapter.start_time_seconds;
        const end = chapter.end_time_seconds!;
        
        try {
          const slice = sliceAudioBuffer(fullAudioBuffer, start, end);
          // Use user-selected mimeType
          const blob = await encodeAudioBuffer(slice, mimeType);
          const url = URL.createObjectURL(blob);
          
          const updatedChapter: SlicedChapter = {
            ...chapter,
            blob,
            url,
            status: 'ready'
          };
          processedChapters.push(updatedChapter);
          
          // Smooth UI updates
          setChapters([...processedChapters, ...finalChapters.slice(i + 1)]);
          setStatus(prev => ({ ...prev, progress: ((i + 1) / finalChapters.length) * 100 }));
        } catch (err) {
          console.error("Slicing error:", err);
          processedChapters.push({ ...chapter, status: 'error' });
        }
      }

      setStatus(prev => ({ ...prev, isSlicing: false }));
    } catch (err: any) {
      console.error(err);
      setStatus({ 
        ...status, 
        isAnalyzing: false, 
        isSlicing: false, 
        error: err.message || "An unexpected error occurred." 
      });
    }
  };

  const handlePlay = (chapter: SlicedChapter) => {
    if (!chapter.url) return;
    
    if (playingId === chapter.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = chapter.url;
        audioRef.current.play();
      }
      setPlayingId(chapter.id);
    }
  };

  const handleDownload = (chapter: SlicedChapter) => {
    if (!chapter.url || !file || !chapter.blob) return;

    // Remove the original extension from the source filename
    const originalBaseName = file.name.replace(/\.[^/.]+$/, "");
    
    // Sanitize the chapter title for safe filenames
    const sanitizedChapterTitle = chapter.title
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/gi, '')
      .toLowerCase();

    // Determine extension based on blob type
    const extension = chapter.blob.type.includes('mpeg') ? 'mp3' : 'wav';
    const fileName = `${originalBaseName}_${sanitizedChapterTitle}.${extension}`;

    const a = document.createElement('a');
    a.href = chapter.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Scissors className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">ChapterSlicer <span className="text-indigo-600">AI</span></h1>
          </div>
          <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
            v1.2 • Pro Edition
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8 space-y-8">
        {/* Upload & Settings Section */}
        <section className="bg-white rounded-2xl shadow-sm border p-6 md:p-8">
          <div className="max-w-2xl mx-auto text-center space-y-4">
            <div className="inline-flex p-3 bg-indigo-50 rounded-full text-indigo-600 mb-2">
              <FileAudio className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold">Split your audiobook</h2>
            <p className="text-slate-500">
              Upload a large audio file and our AI will detect chapter markers automatically.
            </p>
            
            <div className="mt-8">
              <label 
                className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                  file ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {file ? (
                    <>
                      <Volume2 className="w-10 h-10 mb-3 text-indigo-500" />
                      <p className="mb-2 text-sm font-semibold text-slate-700">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Unknown'}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 mb-3 text-slate-400" />
                      <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-slate-400">MP3, WAV, AAC, etc.</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} disabled={status.isAnalyzing || status.isSlicing} />
              </label>
            </div>

            {/* Output Options */}
            {file && !status.isAnalyzing && !status.isSlicing && (
              <div className="mt-8 border-t pt-8 space-y-4">
                <div className="flex items-center gap-2 text-slate-700 font-semibold mb-2">
                  <Settings2 className="w-4 h-4" />
                  <h3>Export Settings</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setOutputFormat('wav')}
                    className={`flex flex-col items-start p-4 border rounded-xl text-left transition-all ${
                      outputFormat === 'wav' 
                      ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' 
                      : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-lg">WAV</span>
                      <span className="bg-green-100 text-green-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Zap className="w-2 h-2" /> Recommended
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">Fast processing, lossless quality, larger files.</span>
                  </button>

                  <button
                    onClick={() => setOutputFormat('mp3')}
                    className={`flex flex-col items-start p-4 border rounded-xl text-left transition-all ${
                      outputFormat === 'mp3' 
                      ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' 
                      : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-lg">MP3</span>
                      <span className="bg-amber-100 text-amber-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Clock className="w-2 h-2" /> Slow
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">Very slow encoding, compressed, smaller files.</span>
                  </button>
                </div>
                
                <button
                  onClick={processAudio}
                  className="w-full py-4 px-6 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 text-lg"
                >
                  <Scissors className="w-5 h-5" />
                  Split into Chapters
                </button>
              </div>
            )}

            {(status.isAnalyzing || status.isSlicing) && (
              <div className="mt-6 p-6 bg-indigo-50 rounded-xl space-y-4 border border-indigo-100">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-indigo-900">
                      {status.isAnalyzing ? "AI is listening for markers..." : `Encoding ${outputFormat.toUpperCase()} chapters...`}
                    </p>
                    <p className="text-sm text-indigo-600">
                      {status.isSlicing && outputFormat === 'mp3' 
                        ? "MP3 encoding is CPU heavy. Please keep this tab open." 
                        : "Almost there! Processing audio slices..."}
                    </p>
                  </div>
                  {status.isSlicing && (
                    <span className="text-sm font-bold text-indigo-700">{Math.round(status.progress)}%</span>
                  )}
                </div>
                {status.isSlicing && (
                  <div className="w-full bg-indigo-200 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out shadow-sm" 
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {status.error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900">Error processing audio</p>
                  <p className="text-xs text-red-600 mt-1">{status.error}</p>
                </div>
                <button onClick={() => setStatus({ ...status, error: null })} className="ml-auto">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Chapters Results */}
        {chapters.length > 0 && (
          <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <CheckCircle className="text-green-500 w-5 h-5" />
                Detected Chapters ({chapters.length})
              </h3>
              {chapters.every(c => c.status === 'ready') && (
                <button 
                  onClick={() => {
                    chapters.forEach(c => handleDownload(c));
                  }}
                  className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download All ZIP
                </button>
              )}
            </div>
            
            <div className="grid gap-3">
              {chapters.map((chapter) => (
                <div 
                  key={chapter.id}
                  className={`group flex items-center justify-between p-4 bg-white border rounded-xl transition-all ${
                    chapter.status === 'ready' ? 'hover:border-indigo-200 hover:shadow-md' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => handlePlay(chapter)}
                      disabled={chapter.status !== 'ready'}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        playingId === chapter.id 
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                          : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                      }`}
                    >
                      {chapter.status === 'ready' ? (
                        playingId === chapter.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                    </button>
                    <div>
                      <h4 className="font-semibold text-slate-800">{chapter.title}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-500">
                          Starts at {formatTime(chapter.start_time_seconds)} 
                          {chapter.end_time_seconds && ` • ${formatTime(chapter.end_time_seconds - chapter.start_time_seconds)}`}
                        </p>
                        {chapter.blob && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                            {chapter.blob.type.split('/')[1] === 'mpeg' ? 'MP3' : 'WAV'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {chapter.status === 'ready' ? (
                      <button 
                        onClick={() => handleDownload(chapter)}
                        className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                        title="Download Chapter"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">PREPARING</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer Info */}
      <footer className="max-w-5xl mx-auto px-4 mt-12 pb-12 text-center text-slate-400 text-xs">
        <div className="flex justify-center gap-4 mb-4">
           <div className="flex items-center gap-1"><Zap className="w-3 h-3 text-green-500" /> Fast WAV</div>
           <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> Compressed MP3</div>
        </div>
        <p>© 2024 ChapterSlicer AI. Powered by Google Gemini. All processing is done in-browser.</p>
        <p className="mt-1 italic">Large audio files may consume significant browser memory. Recommended for files under 200MB.</p>
      </footer>

      {/* Hidden Audio Player */}
      <audio 
        ref={audioRef} 
        onEnded={() => setPlayingId(null)}
        className="hidden"
      />
    </div>
  );
};

export default App;
