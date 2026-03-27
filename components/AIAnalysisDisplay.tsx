"use client";

import { useEffect, useState } from "react";
import { getUrl } from "aws-amplify/storage";
import {
    AlertTriangle,
    CheckCircle,
    ImageIcon,
    Info,
    ShieldAlert,
    ShieldCheck,
    X,
    Zap,
} from "@/components/Icons";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

interface AIDetection {
    label: string;
    confidence: number;
    bbox?: number[];
    notes?: string;
    local_output_path?: string;
}

interface FailedImage {
    path: string;
    stage: "preflight" | "analysis";
    error: string;
}

interface ProcessedImage {
    path: string;
    status: "detected" | "no_detections" | "failed";
    detection_count: number;
    stage?: "preflight" | "analysis";
    error?: string;
    local_output_paths?: string[];
}

interface CopyWarning {
    name: string;
    uri: string;
    error: string;
}

interface AIAnalysisData {
    status?: string;
    error?: string;
    final_assessment?: string;
    progress?: {
        total_images?: number;
        completed_images?: number;
        current_image_index?: number;
        current_image_path?: string;
        current_image_name?: string;
        percent_complete?: number;
    };
    detections?: AIDetection[];
    evidence_bullets?: string[];
    fraud_signals?: string[];
    peril_match?: {
        reported_peril?: string;
        match?: "match" | "partial_match" | "no_match" | "unknown" | string;
        reason?: string;
    };
    local_output_path?: string;
    all_local_paths?: string[];
    total_images_uploaded?: number;
    total_images_attempted?: number;
    total_images_analyzed?: number;
    total_images_failed?: number;
    total_images_with_detections?: number;
    copied_image_count?: number;
    failed_images?: FailedImage[];
    processed_images?: ProcessedImage[];
    copy_warnings?: CopyWarning[];
}

interface AIAnalysisDisplayProps {
    analysis: string | AIAnalysisData | null;
    reportId?: string;
    totalImages?: number;
}

function parseAnalysis(analysis: string | AIAnalysisData | null): AIAnalysisData | null {
    if (!analysis) {
        return null;
    }

    try {
        return typeof analysis === "string" ? JSON.parse(analysis) : analysis;
    } catch (error) {
        console.error("Failed to parse AI analysis:", error);
        return { status: "failed", error: "The AI analysis payload could not be read." };
    }
}

function basename(path: string) {
    return path.split("/").pop() || path;
}

function uniqueStrings(values: Array<string | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function collectOutputPaths(data: AIAnalysisData | null) {
    if (!data) {
        return [];
    }

    const paths: string[] = [];
    if (data.local_output_path) {
        paths.push(data.local_output_path);
    }
    if (Array.isArray(data.all_local_paths)) {
        paths.push(...data.all_local_paths);
    }
    if (Array.isArray(data.detections)) {
        data.detections.forEach((detection) => {
            if (detection.local_output_path) {
                paths.push(detection.local_output_path);
            }
        });
    }
    if (Array.isArray(data.processed_images)) {
        data.processed_images.forEach((image) => {
            if (Array.isArray(image.local_output_paths)) {
                paths.push(...image.local_output_paths);
            }
        });
    }

    return uniqueStrings(paths);
}

function matchTone(match: string) {
    switch (match) {
        case "match":
            return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
        case "partial_match":
            return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800";
        case "no_match":
            return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
        default:
            return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
}

function imageTone(status: ProcessedImage["status"]) {
    switch (status) {
        case "detected":
            return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
        case "no_detections":
            return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
        case "failed":
            return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    }
}

export function AIAnalysisDisplay({ analysis, reportId, totalImages = 0 }: AIAnalysisDisplayProps) {
    const [analysisData, setAnalysisData] = useState<AIAnalysisData | null>(() => parseAnalysis(analysis));
    const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
    const [loadErrors, setLoadErrors] = useState<string[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);

    useEffect(() => {
        setAnalysisData(parseAnalysis(analysis));
    }, [analysis]);

    useEffect(() => {
        if (!analysisData || !reportId || !["pending", "analyzing"].includes(analysisData.status || "")) {
            return;
        }

        const timer = window.setInterval(async () => {
            try {
                const response = await fetch(`/api/incident-reports/${reportId}?t=${Date.now()}`, {
                    cache: "no-store",
                    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
                });
                if (!response.ok) {
                    return;
                }

                const payload = await response.json();
                const latest = parseAnalysis(payload?.report?.aiAnalysis ?? null);
                if (latest) {
                    setAnalysisData(latest);
                }
            } catch (error) {
                console.error("Error polling AI analysis:", error);
            }
        }, 3000);

        return () => window.clearInterval(timer);
    }, [analysisData, reportId]);

    const outputPaths = collectOutputPaths(analysisData);
    const outputPathKey = outputPaths.join("|");

    useEffect(() => {
        if (!analysisData || outputPaths.length === 0 || ["pending", "analyzing"].includes(analysisData.status || "")) {
            setImageUrls(new Map());
            setLoadErrors([]);
            return;
        }

        let cancelled = false;

        const load = async () => {
            const next = new Map<string, string>();
            const errors: string[] = [];

            await Promise.all(outputPaths.map(async (path) => {
                try {
                    const result = await getUrl({ path });
                    next.set(path, result.url.toString());
                } catch (error) {
                    console.error(`Error loading ${path}:`, error);
                    errors.push(`Could not load ${basename(path)}.`);
                }
            }));

            if (!cancelled) {
                setImageUrls(next);
                setLoadErrors(errors);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [analysisData, outputPathKey]);

    useEffect(() => {
        if (selectedPath && !imageUrls.has(selectedPath)) {
            setSelectedPath(null);
        }
    }, [imageUrls, selectedPath]);

    if (!analysisData) {
        return null;
    }

    if (["pending", "analyzing"].includes(analysisData.status || "")) {
        const progress = analysisData.progress;
        const totalImagesForProgress = progress?.total_images ?? analysisData.total_images_uploaded ?? totalImages;
        const completedImages = progress?.completed_images ?? analysisData.processed_images?.length ?? 0;
        const percentComplete = Math.min(100, Math.max(0, progress?.percent_complete ?? (totalImagesForProgress > 0 ? Math.round((completedImages / totalImagesForProgress) * 100) : 0)));
        const currentImageName = progress?.current_image_name || (progress?.current_image_path ? basename(progress.current_image_path) : null);

        return (
            <Card className="mt-8 border-blue-100 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-900/10">
                <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                    <div className="rounded-full bg-blue-100 p-4 dark:bg-blue-900/20">
                        <Zap className="h-8 w-8 animate-pulse text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="w-full max-w-xl">
                        <h3 className="text-lg font-bold text-foreground">AI analysis in progress</h3>
                        <p className="text-sm text-muted-foreground">Processing uploaded images and preparing the report summary.</p>
                        <div className="mt-4 rounded-xl border border-blue-100 bg-white/80 p-4 text-left shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30">
                            <div className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                                <span>{completedImages} of {totalImagesForProgress} images processed</span>
                                <span>{percentComplete}%</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                                <div
                                    className="h-full rounded-full bg-blue-500 transition-[width] duration-500 ease-out"
                                    style={{ width: `${percentComplete}%` }}
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    Step {Math.min(progress?.current_image_index ?? completedImages + 1, totalImagesForProgress || 1)} of {Math.max(totalImagesForProgress, 1)}
                                </Badge>
                                {currentImageName && (
                                    <span className="truncate">Current image: {currentImageName}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const detections = analysisData.detections || [];
    const failedImages = analysisData.failed_images || [];
    const processedImages = analysisData.processed_images || [];
    const copyWarnings = analysisData.copy_warnings || [];
    const evidenceBullets = uniqueStrings(analysisData.evidence_bullets || []);
    const fraudSignals = uniqueStrings(analysisData.fraud_signals || []);
    const perilMatch = analysisData.peril_match || { reported_peril: "", match: "unknown", reason: "" };
    const uploadedCount = analysisData.total_images_uploaded ?? analysisData.total_images_attempted ?? processedImages.length;
    const analyzedCount = analysisData.total_images_analyzed ?? processedImages.filter((image) => image.status !== "failed").length;
    const failedCount = analysisData.total_images_failed ?? failedImages.length;
    const detectedCount = analysisData.total_images_with_detections ?? processedImages.filter((image) => image.status === "detected").length;
    const annotatedCount = analysisData.copied_image_count ?? outputPaths.length;
    const selectedUrl = selectedPath ? imageUrls.get(selectedPath) : undefined;

    const stats = [
        { label: "Uploaded", value: uploadedCount },
        { label: "Analyzed", value: analyzedCount },
        { label: "With Detections", value: detectedCount },
        { label: "Annotated Output", value: annotatedCount },
        { label: "Failed", value: failedCount },
    ];

    return (
        <>
            <Card className="mt-8 overflow-hidden border-blue-100 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-900/10">
                <CardHeader className="bg-blue-600 text-white dark:bg-blue-700">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-white/20 p-2">
                                <Zap className="h-6 w-6 fill-yellow-300 text-yellow-300" />
                            </div>
                            <div>
                                <CardTitle>AI Damage Assessment</CardTitle>
                                <CardDescription className="text-xs text-blue-100">
                                    Uploaded, analyzed, and annotated counts are separated so partial failures are visible.
                                </CardDescription>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="border-white/40 bg-blue-700/40 text-white">{uploadedCount} uploaded</Badge>
                            <Badge variant="outline" className="border-white/40 bg-blue-700/40 text-white">{analyzedCount} analyzed</Badge>
                            {failedCount > 0 && (
                                <Badge variant="outline" className="border-red-200/40 bg-red-500/20 text-white">{failedCount} failed</Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6 p-6">
                    {analysisData.status === "failed" && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                            {analysisData.error || "The AI run failed."}
                        </div>
                    )}

                    {failedImages.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                                <div className="space-y-2">
                                    <p className="font-semibold text-amber-900 dark:text-amber-200">Some uploaded photos did not complete AI analysis.</p>
                                    {failedImages.map((image, index) => (
                                        <div key={`${image.path}-${index}`} className="rounded-md border border-amber-200/80 bg-white/70 p-3 dark:border-amber-900/50 dark:bg-black/10">
                                            <p className="text-sm font-semibold text-foreground">{basename(image.path)}</p>
                                            <p className="text-xs text-amber-900 dark:text-amber-100">{image.stage}: {image.error}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {copyWarnings.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
                            <p className="font-semibold text-red-900 dark:text-red-200">Annotated image copy warnings</p>
                            <div className="mt-2 space-y-2 text-xs text-red-800 dark:text-red-200">
                                {copyWarnings.map((warning, index) => (
                                    <div key={`${warning.uri}-${index}`}>{warning.name}: {warning.error}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {loadErrors.length > 0 && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-xs text-orange-800 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-200">
                            {loadErrors.join(" ")}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {stats.map((stat) => (
                            <div key={stat.label} className="rounded-lg border border-blue-100 bg-card p-4 dark:border-blue-900/30">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</p>
                                <p className="mt-2 text-3xl font-black text-foreground">{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {analyzedCount > annotatedCount && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="flex items-start gap-3">
                                <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-700 dark:text-slate-300" />
                                <p className="text-sm text-slate-800 dark:text-slate-200">
                                    {analyzedCount - annotatedCount} analyzed image(s) are not shown below because there was no saved annotated output to display.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-blue-100 bg-card p-5 dark:border-blue-900/30">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">AI Verdict</p>
                            <div className="mt-3 flex items-center gap-3">
                                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                                <p className="text-2xl font-black capitalize text-foreground">{analysisData.final_assessment || "Assessment incomplete"}</p>
                            </div>
                        </div>
                        <div className="rounded-lg border border-blue-100 bg-card p-5 dark:border-blue-900/30">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Peril Match</p>
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Reported peril</p>
                                    <p className="text-sm font-semibold capitalize text-foreground">{perilMatch.reported_peril || "Not provided"}</p>
                                </div>
                                <Badge className={`${matchTone(perilMatch.match || "unknown")} border`}>
                                    {(perilMatch.match || "unknown").replace("_", " ").toUpperCase()}
                                </Badge>
                            </div>
                            <p className="mt-3 text-xs italic text-muted-foreground">{perilMatch.reason || "No peril match explanation was returned."}</p>
                        </div>
                    </div>

                    {processedImages.length > 0 && (
                        <div className="rounded-lg border border-blue-100 bg-card p-5 dark:border-blue-900/30">
                            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Per-Image Processing Summary</h4>
                            <div className="mt-3 space-y-3">
                                {processedImages.map((image, index) => (
                                    <div key={`${image.path}-${index}`} className="rounded-md border border-border bg-muted/20 p-3">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="font-semibold text-foreground">Photo {index + 1}: {basename(image.path)}</p>
                                                <p className="mt-1 text-[10px] text-muted-foreground">{image.path}</p>
                                            </div>
                                            <Badge className={`${imageTone(image.status)} border`}>
                                                {image.status === "no_detections" ? "Analyzed, no detections" : image.status}
                                            </Badge>
                                        </div>
                                        {image.error && (
                                            <p className="mt-2 text-sm text-red-700 dark:text-red-300">{image.stage ? `${image.stage}: ` : ""}{image.error}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {imageUrls.size > 0 && (
                        <div className="rounded-lg border border-blue-100 bg-card p-5 dark:border-blue-900/30">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                    <ImageIcon className="h-4 w-4 text-blue-500" />
                                    Annotated Images ({imageUrls.size})
                                </h4>
                                <p className="text-xs text-muted-foreground">Only copied annotation outputs appear here.</p>
                            </div>
                            <div className={`grid gap-4 ${imageUrls.size > 1 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
                                {Array.from(imageUrls.entries()).map(([path, url], index) => {
                                    const imageDetections = detections.filter((detection) => {
                                        if (detection.local_output_path) {
                                            return detection.local_output_path === path;
                                        }
                                        return analysisData.local_output_path === path;
                                    });

                                    return (
                                        <div key={path} className="space-y-3">
                                            <button
                                                type="button"
                                                className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted/20 text-left"
                                                onClick={() => setSelectedPath(path)}
                                            >
                                                <img src={url} alt={`Annotated output ${index + 1}`} className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]" />
                                                <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">Image {index + 1}</div>
                                            </button>
                                            <div className="rounded-md border border-border bg-muted/30 p-3">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Visual Detections</p>
                                                <div className="mt-2 space-y-2">
                                                    {imageDetections.length > 0 ? imageDetections.map((detection, detectionIndex) => (
                                                        <div key={`${detection.label}-${detectionIndex}`} className="text-xs">
                                                            <p className="font-medium text-foreground">{detection.label} ({Math.round(detection.confidence * 100)}%)</p>
                                                            {detection.notes && (
                                                                <p className="text-[10px] italic text-muted-foreground">{detection.notes}</p>
                                                            )}
                                                        </div>
                                                    )) : (
                                                        <p className="text-[10px] italic text-muted-foreground">No specific detections were attached to this image.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-6 border-t border-blue-100/50 pt-6 dark:border-blue-900/30 md:grid-cols-3">
                        <div className="md:col-span-2">
                            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-500" />
                                Evidence Bullets
                            </h4>
                            <div className="mt-3 space-y-2">
                                {evidenceBullets.length > 0 ? evidenceBullets.map((bullet, index) => (
                                    <div key={`${bullet}-${index}`} className="flex items-start gap-3 rounded-md bg-card/50 p-2 text-sm text-foreground">
                                        <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                                        <span>{bullet}</span>
                                    </div>
                                )) : (
                                    <p className="text-sm italic text-muted-foreground">No evidence bullets were returned for this report.</p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5 dark:border-red-900/30 dark:bg-red-900/10">
                            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-800 dark:text-red-300">
                                <ShieldAlert className="h-4 w-4" />
                                Risk Indicators
                            </h4>
                            <div className="mt-3 space-y-2">
                                {fraudSignals.length > 0 ? fraudSignals.map((signal, index) => (
                                    <div key={`${signal}-${index}`} className="flex items-start gap-2 rounded-md bg-white/40 p-2 text-xs font-bold text-red-700 dark:bg-black/20 dark:text-red-300">
                                        <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                        <span>{signal}</span>
                                    </div>
                                )) : (
                                    <p className="text-xs italic text-green-700 dark:text-green-400">No risk indicators were flagged.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {selectedPath && selectedUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setSelectedPath(null)}>
                    <div className="max-h-[95vh] max-w-5xl overflow-auto rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{basename(selectedPath)}</p>
                            <button type="button" className="rounded-full p-2 text-muted-foreground hover:bg-muted" onClick={() => setSelectedPath(null)}>
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <img src={selectedUrl} alt="Annotated AI image" className="max-h-[80vh] max-w-full rounded-lg object-contain" />
                    </div>
                </div>
            )}
        </>
    );
}
