import { useState, useRef, useEffect } from "react";
import { Upload, Download, RotateCw, Loader, Image as ImageIcon, Maximize2, Minimize2, Wand2, X, Send, Sparkles } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PhotoEditor({ projectId, token }) {
    const [image, setImage] = useState(null);
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [saturation, setSaturation] = useState(100);
    const [uploading, setUploading] = useState(false);
    const [projectImages, setProjectImages] = useState([]);
    const [loadingMedia, setLoadingMedia] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState(null);

    // AI Analysis states
    const [isAISidebarOpen, setIsAISidebarOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState("");
    const [aiError, setAiError] = useState("");

    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const containerRef = useRef(null);

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;
        try {
            if (!document.fullscreenElement) {
                await containerRef.current.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error("Error toggling fullscreen:", error);
        }
    };

    // Load project media on mount
    useEffect(() => {
        if (projectId) {
            loadProjectMedia();
        }
    }, [projectId]);

    const loadProjectMedia = async () => {
        setLoadingMedia(true);
        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/workspace/media`);
            const data = await response.json();
            const images = (data.media || []).filter(m => m.type === "image");
            setProjectImages(images);
        } catch (error) {
            console.error("Error loading media:", error);
        } finally {
            setLoadingMedia(false);
        }
    };

    useEffect(() => {
        if (image) {
            applyFilters();
        }
    }, [image, brightness, contrast, saturation]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert("File too large. Maximum size is 10MB.");
            return;
        }

        // Load for editing
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                setImage(img);
                const canvas = canvasRef.current;
                canvas.width = img.width;
                canvas.height = img.height;
                applyFilters(img);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);

        // Upload to Cloudinary
        if (projectId) {
            await uploadToCloudinary(file);
        }
    };

    const uploadToCloudinary = async (file) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "image");

            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/workspace/upload`, {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setProjectImages([...projectImages, data]);
                setCurrentImageUrl(data.url);
            } else {
                const error = await response.json();
                alert(error.error || "Upload failed");
            }
        } catch (error) {
            console.error("Upload error:", error);
        } finally {
            setUploading(false);
        }
    };

    const loadFromProject = (url) => {
        setCurrentImageUrl(url);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            setImage(img);
            const canvas = canvasRef.current;
            canvas.width = img.width;
            canvas.height = img.height;
            applyFilters(img);
        };
        img.src = url;
    };

    const applyFilters = (img = image) => {
        if (!img) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        ctx.drawImage(img, 0, 0);
    };

    const downloadImage = () => {
        const canvas = canvasRef.current;
        const url = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = url;
        link.download = "edited-photo.png";
        link.click();
    };

    const analyzeImage = async () => {
        if (!aiPrompt.trim() || !currentImageUrl) return;

        setIsAnalyzing(true);
        setAiError("");
        setAiAnalysis("");

        try {
            const response = await fetch(`${API_BASE_URL}/analyze-media`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    mediaUrl: currentImageUrl,
                    mediaType: "image",
                    prompt: aiPrompt
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setAiAnalysis(data.analysis);
        } catch (error) {
            console.error("Error analyzing image:", error);
            setAiError(error.message || "Failed to analyze image.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const resetFilters = () => {
        setBrightness(100);
        setContrast(100);
        setSaturation(100);
    };

    return (
        <div ref={containerRef} className={`flex flex-col h-full bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 ${isFullscreen ? 'rounded-none' : ''}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
                <div className="flex gap-2 items-center">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {uploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
                        <span className="text-sm">{uploading ? "Uploading..." : "Upload Image"}</span>
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <span className="text-xs text-slate-500">Max 10MB</span>
                </div>

                {image && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsAISidebarOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                        >
                            <Wand2 size={18} />
                            <span className="text-sm">Ask AI</span>
                        </button>
                        <button
                            onClick={resetFilters}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Reset"
                        >
                            <RotateCw size={18} className="text-slate-300" />
                        </button>
                        <button
                            onClick={downloadImage}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Download"
                        >
                            <Download size={18} className="text-slate-300" />
                        </button>
                    </div>
                )}

                {/* Fullscreen Toggle */}
                <button
                    onClick={toggleFullscreen}
                    className="flex items-center justify-center w-8 h-8 bg-black/40 backdrop-blur-md rounded-full text-white/70 border border-white/5 hover:bg-white/10 hover:text-white transition-all duration-200"
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                {/* Preview */}
                <div className="flex-1 flex items-center justify-center bg-black/30 rounded-lg border border-white/10 overflow-auto">
                    {image ? (
                        <canvas
                            ref={canvasRef}
                            className="max-w-full max-h-full"
                        />
                    ) : (
                        <div className="text-center text-slate-500">
                            <Upload size={48} className="mx-auto mb-2 opacity-50" />
                            <p>Upload an image to get started</p>
                        </div>
                    )}
                </div>

                {/* Side Panel */}
                <div className="w-64 space-y-4 overflow-y-auto">
                    {/* Controls */}
                    {image && (
                        <div className="space-y-4 p-3 bg-white/5 rounded-lg border border-white/10">
                            <h3 className="text-sm font-medium text-slate-300">Adjustments</h3>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">
                                    Brightness: {brightness}%
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={brightness}
                                    onChange={(e) => setBrightness(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">
                                    Contrast: {contrast}%
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={contrast}
                                    onChange={(e) => setContrast(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">
                                    Saturation: {saturation}%
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={saturation}
                                    onChange={(e) => setSaturation(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                        </div>
                    )}

                    {/* Project Images */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                        <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                            <ImageIcon size={14} />
                            Project Images
                        </h3>
                        {loadingMedia ? (
                            <div className="text-xs text-slate-500">Loading...</div>
                        ) : projectImages.length === 0 ? (
                            <div className="text-xs text-slate-500">No images uploaded yet</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {projectImages.map((img, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => loadFromProject(img.url)}
                                        className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-indigo-500 transition-colors"
                                    >
                                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Sidebar */}
            <div
                className={`absolute top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 z-20 transform transition-transform duration-300 ease-out ${isAISidebarOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg">
                            <Wand2 size={16} className="text-white" />
                        </div>
                        <span className="font-semibold text-white">Ask Gemini AI</span>
                    </div>
                    <button
                        onClick={() => setIsAISidebarOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Sidebar Content */}
                <div className="p-4 flex flex-col h-[calc(100%-60px)] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    <p className="text-slate-400 text-sm mb-4">
                        Ask anything about your image. Gemini can describe it, suggest edits, or explain contents.
                    </p>

                    {/* Prompt Input */}
                    <div className="relative mb-4">
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    analyzeImage();
                                }
                            }}
                            placeholder="e.g., How can I improve the lighting in this photo?"
                            className="w-full h-28 p-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                            disabled={isAnalyzing}
                        />
                    </div>

                    {/* Error Message */}
                    {aiError && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                            {aiError}
                        </div>
                    )}

                    {/* Generate Button */}
                    <button
                        onClick={analyzeImage}
                        disabled={!aiPrompt.trim() || isAnalyzing || !currentImageUrl}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/20 disabled:shadow-none"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader size={18} className="animate-spin" />
                                <span>Analyzing...</span>
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                <span>Ask AI</span>
                            </>
                        )}
                    </button>

                    {/* AI Analysis Result */}
                    {aiAnalysis && (
                        <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
                            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Sparkles size={12} />
                                Gemini Analysis
                            </h4>
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {aiAnalysis}
                            </div>
                        </div>
                    )}

                    {/* Example Prompts */}
                    <div className="mt-6">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Try these</p>
                        <div className="space-y-2">
                            {[
                                "Describe this image in detail",
                                "How to enhance the colors?",
                                "What is the mood of this photo?",
                                "Identify objects in this image"
                            ].map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => setAiPrompt(prompt)}
                                    disabled={isAnalyzing}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10 disabled:opacity-50"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
