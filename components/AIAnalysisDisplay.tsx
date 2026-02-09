"use client";

import React, { useState, useEffect } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, AlertTriangle, Info, ShieldCheck, ShieldAlert, Zap, ImageIcon } from "@/components/Icons";

interface AIDetection {
    label: string;
    confidence: number;
    bbox: number[];
    image_reference: string;
    notes: string;
    local_output_path?: string;
}

interface AIAnalysisData {
    image_id: string;
    total_images_analyzed: number;
    detections: AIDetection[];
    peril_match: {
        reported_peril: string;
        match: "match" | "partial_match" | "no_match";
        reason: string;
    };
    fraud_signals: string[];
    evidence_bullets: string[];
    final_assessment: string;
    local_output_path?: string;
    all_local_paths?: string[];
    status?: string; // pending, completed, failed
}

interface AIAnalysisDisplayProps {
    analysis: string | AIAnalysisData | null;
    reportId?: string;
}

export function AIAnalysisDisplay({ analysis, reportId }: AIAnalysisDisplayProps) {
    const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
    const [analysisData, setAnalysisData] = useState<AIAnalysisData | null>(null);
    const [loadErrors, setLoadErrors] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<{ path: string, url: string } | null>(null);

    // Initialize state from props
    useEffect(() => {
        if (analysis) {
            try {
                const parsed = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
                setAnalysisData(parsed);
            } catch (e) {
                console.error("Failed to parse initial AI analysis:", e);
            }
        }
    }, [analysis]);

    // Polling logic for pending OR analyzing status
    useEffect(() => {
        // Poll if status is 'pending' OR 'analyzing' AND we have a reportId
        if (analysisData && (analysisData.status === 'pending' || analysisData.status === 'analyzing') && reportId) {
            console.log(`Polling for report ${reportId}...`);
            const interval = setInterval(async () => {
                try {
                    // Fetch specific report using the ID endpoint with aggressive cache busting
                    const res = await fetch(`/api/incident-reports/${reportId}?t=${Date.now()}`, {
                        cache: 'no-store',
                        headers: {
                            'Pragma': 'no-cache',
                            'Cache-Control': 'no-cache'
                        }
                    });

                    if (res.ok) {
                        const json = await res.json();
                        const updatedReport = json.report; // Single report response

                        if (updatedReport?.aiAnalysis) {
                            try {
                                const newAnalysis = JSON.parse(updatedReport.aiAnalysis);
                                // If status changed from pending/analyzing to something else (or just has valid detections)
                                if ((newAnalysis.status !== 'pending' && newAnalysis.status !== 'analyzing') || newAnalysis.detections) {
                                    console.log("Analysis completed! Updating UI...", newAnalysis);
                                    setAnalysisData(newAnalysis);
                                }
                            } catch (err) {
                                console.error("Error parsing polled analysis:", err);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Polling fetch error:", e);
                }
            }, 3000); // Check every 3 seconds

            return () => clearInterval(interval);
        }
    }, [analysisData, reportId]);

    // Fetch image URLs when analysisData updates (and is valid)
    useEffect(() => {
        if (!analysisData) return;
        if (analysisData.status === 'pending') return;

        const fetchUrls = async () => {
            const uniquePaths = new Set<string>();

            // Collect paths from new detections structure
            analysisData.detections?.forEach(d => {
                if (d.local_output_path) uniquePaths.add(d.local_output_path);
            });

            // Collect paths from summary
            analysisData.all_local_paths?.forEach(p => uniquePaths.add(p));

            // Backward compatibility
            if (analysisData.local_output_path) uniquePaths.add(analysisData.local_output_path);

            if (uniquePaths.size === 0) return;

            const newUrlMap = new Map<string, string>();

            await Promise.all(Array.from(uniquePaths).map(async (path) => {
                try {
                    const res = await getUrl({ path });
                    newUrlMap.set(path, res.url.toString());
                } catch (err) {
                    // console.error("Error fetching URL:", path, err); 
                }
            }));

            setImageUrls(newUrlMap);
        };

        fetchUrls();
    }, [analysisData]);

    if (!analysisData) return null;

    // Check for pending OR analyzing status
    if (analysisData.status === 'pending' || analysisData.status === 'analyzing') {
        return (
            <Card className="mt-8 border-blue-100 bg-blue-50/10 overflow-hidden shadow-sm animate-pulse">
                <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="bg-blue-100 p-4 rounded-full">
                        <Zap className="w-8 h-8 text-blue-600 animate-bounce" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">AI Analysis in Progress</h3>
                        <p className="text-sm text-gray-500">Processing images and generating damage assessment...</p>
                    </div>
                    <div className="w-full max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '50%' }}></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!analysisData.detections) return null;

    const getMatchColor = (match: string) => {
        switch (match) {
            case 'match': return 'bg-green-100 text-green-800 border-green-200';
            case 'partial_match': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'no_match': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    // Filter detections for the selected image
    const selectedDetections = analysisData.detections?.filter(d =>
        d.local_output_path === selectedImage?.path ||
        (!d.local_output_path && analysisData.local_output_path === selectedImage?.path)
    ) || [];

    return (
        <>
            <Card className="mt-8 border-blue-100 bg-blue-50/20 overflow-hidden shadow-sm">
                <CardHeader className="bg-blue-600 text-white p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-lg">
                                <Zap className="w-6 h-6 fill-yellow-300 text-yellow-300 animate-pulse" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-bold tracking-tight">AI Damage Assessment</CardTitle>
                                <CardDescription className="text-blue-100 text-xs">
                                    Computer vision analysis of incident evidence
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant="outline" className="w-fit text-white border-white/40 bg-blue-700/40 px-3 py-1 font-semibold text-xs whitespace-nowrap">
                            {analysisData.total_images_analyzed || imageUrls.size || 0} Images Analyzed
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent className="p-6 space-y-8">
                    {/* Debugging Alerts */}
                    {(analysisData as any).copy_warnings && (analysisData as any).copy_warnings.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-4 space-y-2">
                            <h4 className="text-red-800 font-bold text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Backend Copy Failures
                            </h4>
                            <ul className="text-xs text-red-700 list-disc pl-5">
                                {(analysisData as any).copy_warnings.map((w: any, i: number) => (
                                    <li key={i}>
                                        <span className="font-semibold">{w.name}:</span> {w.error} <br />
                                        <span className="text-red-700/60 break-all">{w.uri}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {loadErrors.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-md p-4 space-y-2">
                            <h4 className="text-orange-800 font-bold text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Frontend Loading Failures
                            </h4>
                            <ul className="text-xs text-orange-700 list-disc pl-5">
                                {loadErrors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {/* Top Section: Final Assessment & Peril Match */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm transition-all hover:border-blue-300">
                            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3">AI Verdict</h4>
                            <div className="flex items-center gap-4 mb-3">
                                <span className="text-3xl font-black text-gray-900 capitalize tracking-tighter">
                                    {analysisData.final_assessment}
                                </span>
                                <div className="bg-green-100 p-1 rounded-full">
                                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed font-medium">
                                Primary damage identified as <span className="text-blue-700 font-bold">{analysisData.final_assessment}</span>.
                            </p>
                        </div>

                        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm transition-all hover:border-blue-300">
                            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3">Peril Match Analysis</h4>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">Reported Peril</span>
                                    <span className="text-sm font-bold text-gray-800 capitalize">{analysisData.peril_match.reported_peril}</span>
                                </div>
                                <Badge className={`${getMatchColor(analysisData.peril_match.match)} border px-2 py-0.5 font-bold text-[10px]`}>
                                    {analysisData.peril_match.match.replace('_', ' ').toUpperCase()}
                                </Badge>
                            </div>
                            <p className="text-xs text-gray-500 italic leading-normal border-l-2 border-blue-200 pl-3">
                                "{analysisData.peril_match.reason}"
                            </p>
                        </div>
                    </div>

                    {/* Analyzed Image Gallery */}
                    {imageUrls.size > 0 && (
                        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-blue-500" />
                                Analyzed Imagery ({imageUrls.size})
                            </h4>
                            <div className={`grid gap-6 ${imageUrls.size > 1 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                                {Array.from(imageUrls.entries()).map(([path, url], idx) => {
                                    // Filter detections for this specific image
                                    const imageDetections = analysisData.detections?.filter(d =>
                                        d.local_output_path === path ||
                                        (!d.local_output_path && analysisData.local_output_path === path)
                                    ) || [];

                                    return (
                                        <div key={idx} className="flex flex-col gap-2">
                                            <div
                                                className="rounded-lg overflow-hidden border border-gray-200 aspect-video relative group cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all shadow-sm"
                                                onClick={() => setSelectedImage({ path, url })}
                                            >
                                                <img
                                                    src={url}
                                                    alt={`AI Analyzed ${idx + 1}`}
                                                    className="w-full h-full object-contain bg-gray-50 transition-transform group-hover:scale-105"
                                                />
                                                <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-md">
                                                    Img {idx + 1}
                                                </div>
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <span className="bg-white/90 text-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">View Fullscreen</span>
                                                </div>
                                            </div>

                                            {/* Detections specific to this image (Grid View) */}
                                            <div className="bg-gray-50 rounded-md p-3 border border-gray-100 flex-1">
                                                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Visual Detections</h5>
                                                {imageDetections.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {imageDetections.map((d, i) => (
                                                            <div key={i} className="flex flex-col gap-1 text-xs border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                                                                <div className="flex items-start gap-2">
                                                                    <Badge className="px-1 py-0 h-4 text-[9px] bg-blue-100 text-blue-700 border-none shrink-0">
                                                                        {Math.round(d.confidence * 100)}%
                                                                    </Badge>
                                                                    <span className="font-medium text-gray-700 leading-tight">{d.label}</span>
                                                                </div>
                                                                {d.notes && (
                                                                    <p className="text-[10px] text-gray-500 italic pl-6 leading-normal">
                                                                        "{d.notes}"
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-gray-400 italic">No specific detections marked on this image.</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Evidence & Fraud Section (Global) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-blue-100/50">
                        <div className="md:col-span-2 space-y-4">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-green-600" />
                                Evidence Bullets
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                                {Array.from(new Set(analysisData.evidence_bullets)).map((bullet, idx) => (
                                    <div key={idx} className="text-[11px] text-gray-700 flex items-start gap-3 bg-white/50 p-2 rounded-lg border border-transparent hover:border-green-100 transition-colors">
                                        <div className="w-2 h-2 rounded-full bg-green-500 mt-1 flex-shrink-0 shadow-sm shadow-green-200" />
                                        <span className="leading-tight">{bullet}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-red-50/40 p-5 rounded-2xl border border-red-100 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 -mr-6 -mt-6 bg-red-100/50 rounded-full group-hover:scale-110 transition-transform" />
                            <h4 className="text-xs font-black text-red-800 uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                                <ShieldAlert className="w-4 h-4" />
                                Risk Indicators
                            </h4>
                            <div className="space-y-3 relative z-10">
                                {(() => {
                                    // Deduplicate and count signals
                                    const signalCounts = new Map<string, number>();
                                    // Normalize for loose matching (lowercase, remove punctuation)
                                    const normalizedMap = new Map<string, string>(); // normalized -> original

                                    analysisData.fraud_signals.forEach(signal => {
                                        const normalized = signal.toLowerCase().replace(/[^\w\s]/g, '').trim();

                                        // Specific heuristic: "No weather report" variations
                                        if (normalized.includes("no weather report")) {
                                            const key = "no_weather_report_group";
                                            // Store the most descriptive one if not exists or override if current is better
                                            if (!normalizedMap.has(key) || signal.length > normalizedMap.get(key)!.length) {
                                                normalizedMap.set(key, signal);
                                            }
                                            signalCounts.set(key, (signalCounts.get(key) || 0) + 1);
                                        } else {
                                            // General deduplication
                                            if (!signalCounts.has(signal)) {
                                                signalCounts.set(signal, 1);
                                            } else {
                                                signalCounts.set(signal, signalCounts.get(signal)! + 1);
                                            }
                                        }
                                    });

                                    // If we grouped weather reports, use the representative string
                                    const displaySignals: { text: string, count: number }[] = [];

                                    signalCounts.forEach((count, key) => {
                                        if (key === "no_weather_report_group") {
                                            displaySignals.push({ text: normalizedMap.get(key) || "No weather report provided (Multiple checks failed)", count });
                                        } else {
                                            displaySignals.push({ text: key, count });
                                        }
                                    });

                                    return (
                                        <>
                                            {displaySignals.map((item, idx) => (
                                                <div key={idx} className="text-[10px] text-red-700 font-bold flex items-start gap-3 bg-white/40 p-2 rounded-lg border border-red-200/30">
                                                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-red-500" />
                                                    <span className="leading-snug">
                                                        {item.text}
                                                        {item.count > 1 && (
                                                            <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-800 rounded-full text-[9px]">x{item.count}</span>
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                            {displaySignals.length === 0 && (
                                                <p className="text-xs text-green-700 italic font-medium">No fraud signals identified by current model params.</p>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Lightbox / Modal */}
            {selectedImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
                    <div
                        className="bg-white rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white z-10">
                            <div className="flex items-center gap-3">
                                <ImageIcon className="w-5 h-5 text-blue-600" />
                                <div>
                                    <h3 className="font-bold text-gray-800">Detailed Analysis</h3>
                                    <p className="text-xs text-gray-500">Image {Array.from(imageUrls.keys()).indexOf(selectedImage.path) + 1} of {imageUrls.size}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                            >
                                <span className="sr-only">Close</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-0 flex flex-col md:flex-row h-full relative">
                            {/* Navigation Buttons (Overlay) */}
                            {imageUrls.size > 1 && (
                                <>
                                    <button
                                        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all backdrop-blur-sm shadow-lg disabled:opacity-30 md:hidden lg:flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const entries = Array.from(imageUrls.entries());
                                            const currentIndex = entries.findIndex(([p]) => p === selectedImage.path);
                                            const prevIndex = currentIndex > 0 ? currentIndex - 1 : entries.length - 1;
                                            setSelectedImage({ path: entries[prevIndex][0], url: entries[prevIndex][1] });
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                    </button>
                                    <button
                                        className="absolute right-[420px] top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all backdrop-blur-sm shadow-lg disabled:opacity-30 md:hidden lg:flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const entries = Array.from(imageUrls.entries());
                                            const currentIndex = entries.findIndex(([p]) => p === selectedImage.path);
                                            const nextIndex = currentIndex < entries.length - 1 ? currentIndex + 1 : 0;
                                            setSelectedImage({ path: entries[nextIndex][0], url: entries[nextIndex][1] });
                                        }}
                                        style={{ right: 'max(400px, 20px)' }} // Adjust based on sidebar visibility
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                    </button>
                                </>
                            )}

                            {/* Image Side */}
                            <div className="flex-1 bg-gray-50/50 p-6 flex items-center justify-center min-h-[400px] border-b md:border-b-0 md:border-r border-gray-100 relative">
                                <img
                                    src={selectedImage.url}
                                    alt="Detailed View"
                                    className="max-w-full max-h-[75vh] object-contain shadow-lg rounded-lg"
                                />
                                {/* Mobile Nav (Bottom) */}
                                {imageUrls.size > 1 && (
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 lg:hidden z-20">
                                        <button
                                            className="bg-black/70 text-white p-3 rounded-full shadow-lg"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const entries = Array.from(imageUrls.entries());
                                                const currentIndex = entries.findIndex(([p]) => p === selectedImage.path);
                                                const prevIndex = currentIndex > 0 ? currentIndex - 1 : entries.length - 1;
                                                setSelectedImage({ path: entries[prevIndex][0], url: entries[prevIndex][1] });
                                            }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                        </button>
                                        <button
                                            className="bg-black/70 text-white p-3 rounded-full shadow-lg"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const entries = Array.from(imageUrls.entries());
                                                const currentIndex = entries.findIndex(([p]) => p === selectedImage.path);
                                                const nextIndex = currentIndex < entries.length - 1 ? currentIndex + 1 : 0;
                                                setSelectedImage({ path: entries[nextIndex][0], url: entries[nextIndex][1] });
                                            }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Detections Side (Sidebar) */}
                            <div className="w-full md:w-[400px] bg-white flex flex-col border-l border-gray-100 shadow-xl z-30">
                                <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <Info className="w-4 h-4 text-blue-500" />
                                        Visual Detections ({selectedDetections.length})
                                    </h4>
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30">
                                    {selectedDetections.length > 0 ? (
                                        selectedDetections.map((detection, idx) => (
                                            <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
                                                        <span className="font-bold text-gray-900 capitalize text-sm">{detection.label}</span>
                                                    </div>
                                                    <Badge className="bg-blue-600 text-white border-none shadow-sm shadow-blue-200">
                                                        {Math.round(detection.confidence * 100)}%
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-gray-600 italic bg-gray-50 p-3 rounded-lg border border-gray-100 leading-relaxed">
                                                    "{detection.notes}"
                                                </p>
                                                {detection.bbox && (
                                                    <div className="mt-3 text-[9px] text-gray-400 font-mono bg-gray-100/50 p-1.5 rounded w-fit">
                                                        Region: [{detection.bbox.map(n => Math.round(n)).join(', ')}]
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-12 px-6">
                                            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Info className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-900 font-medium mb-1">No Detections</p>
                                            <p className="text-xs text-gray-500">There are no specific visual detections mapped to this image region.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
