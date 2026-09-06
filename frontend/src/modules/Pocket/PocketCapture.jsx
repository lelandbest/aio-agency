import React, { useState, useRef } from 'react';
import { Camera, FileText, Mic, Upload, CheckCircle2, AlertCircle, Image } from 'lucide-react';
import { PocketService } from '../../services/pocket.service';

export default function PocketCapture() {
  const [captureMode, setCaptureMode] = useState('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [category, setCategory] = useState('General');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const categories = ['Episode Idea', 'Guest Prep', 'Stage Photo', 'Tech Note', 'Receipt'];

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && !selectedFile) {
      setError('Please provide a title, note content, or file to capture.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadSuccess(false);

      const formData = new FormData();
      formData.append('title', title.trim() || 'Mobile Capture');
      formData.append('type', captureMode);
      formData.append('content', content.trim());
      formData.append('category', category);
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      await PocketService.captureVaultItem(formData);

      setUploadSuccess(true);
      setTitle('');
      setContent('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (err) {
      setError(err.message || 'Capture upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-400" />
          Vault Quick Ingest
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Capture notes, photos, and voice directly into local appliance memory
        </p>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800">
        <button
          type="button"
          onClick={() => setCaptureMode('note')}
          className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            captureMode === 'note'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Text Note
        </button>
        <button
          type="button"
          onClick={() => {
            setCaptureMode('photo');
            setTimeout(() => fileInputRef.current?.click(), 100);
          }}
          className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            captureMode === 'photo'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          Photo
        </button>
        <button
          type="button"
          onClick={() => setCaptureMode('voice')}
          className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            captureMode === 'voice'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          Voice Memo
        </button>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 space-y-4 shadow-xl">
        {/* Category Pills */}
        <div>
          <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
            Category
          </label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs transition active:scale-95 ${
                  category === cat
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Title Input */}
        <div>
          <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Episode 42 Outline, Stage Layout"
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700/80 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Content Note Textarea */}
        {captureMode !== 'photo' && (
          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block mb-1">
              {captureMode === 'voice' ? 'Voice Transcription / Notes' : 'Content & Thoughts'}
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your notes or transcription here..."
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700/80 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        )}

        {/* File / Camera Upload Area */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={captureMode === 'photo' ? 'image/*' : '*/*'}
            capture={captureMode === 'photo' ? 'environment' : undefined}
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-2xl bg-zinc-800/40 flex flex-col items-center justify-center gap-2 text-zinc-400 transition"
          >
            {selectedFile ? (
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold px-2">
                <Image className="w-4 h-4 text-indigo-400" />
                <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                <span className="text-zinc-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
              </div>
            ) : (
              <>
                <Camera className="w-6 h-6 text-zinc-500" />
                <span className="text-xs">
                  {captureMode === 'photo' ? 'Take Photo or Choose from Gallery' : 'Attach File or Audio Recording'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-rose-950/40 border border-rose-800/60 p-3 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Item ingested into Vault! Cortex embeddings scheduled.</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isUploading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-98 disabled:opacity-40 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-indigo-950/60 flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {isUploading ? 'Ingesting into Vault...' : 'Save to Vault'}
        </button>
      </form>
    </div>
  );
}
