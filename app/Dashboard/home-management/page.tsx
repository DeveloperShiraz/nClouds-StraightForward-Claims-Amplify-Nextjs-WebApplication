"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Home, Plus, Search, ChevronUpIcon, ChevronDownIcon, Pencil1Icon, TrashIcon } from "@/components/Icons";
import { PropertyModal } from "@/components/forms/PropertyModal";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select";

const client = generateClient<Schema>();

// Helper to normalize an address string for comparison
function normalizeAddress(address: string, city: string, state: string, zip: string): string {
    return `${address} ${city} ${state} ${zip}`.toLowerCase().replace(/\s+/g, " ").trim();
}

interface IncidentReportSummary {
    id: string;
    claimNumber: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    status?: string;
}

export default function HomeManagementPage() {
    const router = useRouter();
    const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
    const [properties, setProperties] = useState<Schema["Property"]["type"][]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [editingProperty, setEditingProperty] = useState<Schema["Property"]["type"] | null>(null);
    const [deletingProperty, setDeletingProperty] = useState<Schema["Property"]["type"] | null>(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedCity, setSelectedCity] = useState<string>("all");
    const [selectedState, setSelectedState] = useState<string>("all");
    const [incidentReports, setIncidentReports] = useState<IncidentReportSummary[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const sub = client.models.Property.observeQuery().subscribe({
            next: ({ items }) => {
                setProperties(items);
            },
            error: (err) => console.error("Error fetching properties:", err),
        });

        return () => sub.unsubscribe();
    }, []);

    // Fetch incident reports to match against properties
    useEffect(() => {
        const fetchReports = async () => {
            try {
                const response = await fetch("/api/incident-reports");
                const data = await response.json();
                if (response.ok && data.reports) {
                    setIncidentReports(data.reports.map((r: any) => ({
                        id: r.id,
                        claimNumber: r.claimNumber,
                        address: r.address || "",
                        city: r.city || "",
                        state: r.state || "",
                        zip: r.zip || "",
                        status: r.status,
                    })));
                }
            } catch (err) {
                console.error("Error fetching incident reports for matching:", err);
            }
        };
        fetchReports();
    }, []);

    // Build a map of normalized address -> report count
    const reportCountByAddress = useMemo(() => {
        const map: Record<string, number> = {};
        for (const report of incidentReports) {
            const key = normalizeAddress(report.address, report.city, report.state, report.zip);
            map[key] = (map[key] || 0) + 1;
        }
        return map;
    }, [incidentReports]);

    const getReportCount = useCallback((property: Schema["Property"]["type"]) => {
        const key = normalizeAddress(property.address, property.city, property.state, property.zip);
        return reportCountByAddress[key] || 0;
    }, [reportCountByAddress]);

    const handleViewReports = (property: Schema["Property"]["type"]) => {
        const address = encodeURIComponent(property.address);
        const city = encodeURIComponent(property.city);
        const state = encodeURIComponent(property.state);
        const zip = encodeURIComponent(property.zip);
        router.push(`/Dashboard/reports?address=${address}&city=${city}&state=${state}&zip=${zip}`);
    };

    const uniqueCities = useMemo(() => {
        const cities = properties.map((p) => p.city).filter(Boolean);
        return Array.from(new Set(cities)).sort();
    }, [properties]);

    const uniqueStates = useMemo(() => {
        const states = properties.map((p) => p.state).filter(Boolean);
        return Array.from(new Set(states)).sort();
    }, [properties]);

    const handleEdit = (property: Schema["Property"]["type"]) => {
        setEditingProperty(property);
        setIsPropertyModalOpen(true);
    };

    const handleDelete = (property: Schema["Property"]["type"]) => {
        setDeletingProperty(property);
        setIsDeleteOpen(true);
    };

    const confirmDelete = async () => {
        if (!deletingProperty) return;

        setIsDeleting(true);
        try {
            const { errors } = await client.models.Property.delete({ id: deletingProperty.id });
            if (errors) {
                console.error("Error deleting property:", errors);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to delete property. Please try again.",
                });
                return;
            }

            toast({
                title: "Success",
                description: "Property deleted successfully.",
            });
            setIsDeleteOpen(false);
            setDeletingProperty(null);
        } catch (error) {
            console.error("Unexpected error deleting property:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred.",
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleModalClose = () => {
        setIsPropertyModalOpen(false);
        setEditingProperty(null);
    };

    const filteredProperties = properties
        .filter((property) => {
            const query = searchQuery.toLowerCase();
            const matchesSearch =
                property.propertyName.toLowerCase().includes(query) ||
                property.address.toLowerCase().includes(query) ||
                property.city.toLowerCase().includes(query) ||
                property.state.toLowerCase().includes(query) ||
                property.zip.toLowerCase().includes(query);

            const matchesCity = selectedCity === "all" || property.city === selectedCity;
            const matchesState = selectedState === "all" || property.state === selectedState;

            return matchesSearch && matchesCity && matchesState;
        })
        .sort((a, b) => {
            const nameA = a.propertyName.toLowerCase();
            const nameB = b.propertyName.toLowerCase();
            if (sortOrder === "asc") {
                return nameA.localeCompare(nameB);
            } else {
                return nameB.localeCompare(nameA);
            }
        });

    return (
        <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col gap-2">
                    <Heading size="sm" className="text-foreground">
                        Home Management
                    </Heading>
                    <p className="text-muted-foreground text-sm">
                        Manage your property details and view insights.
                    </p>
                </div>
                <Button onClick={() => setIsPropertyModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Properties
                </Button>
            </div>

            <div className="flex flex-col lg:flex-row items-center gap-4 mb-6">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by address, city, state, or zip..."
                        className="pl-8 w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                    <Select value={selectedCity} onValueChange={setSelectedCity}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="City" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Cities</SelectItem>
                            {uniqueCities.map((city) => (
                                <SelectItem key={city} value={city}>
                                    {city}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={selectedState} onValueChange={setSelectedState}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All States</SelectItem>
                            {uniqueStates.map((state) => (
                                <SelectItem key={state} value={state}>
                                    {state}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        className="w-full sm:w-auto min-w-[140px]"
                        onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                    >
                        Sort: {sortOrder === "asc" ? "A-Z" : "Z-A"}
                        {sortOrder === "asc" ? (
                            <ChevronDownIcon className="ml-2 h-4 w-4" />
                        ) : (
                            <ChevronUpIcon className="ml-2 h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>

            <div className="mb-4 text-sm text-muted-foreground font-medium">
                Showing {filteredProperties.length} {filteredProperties.length === 1 ? "property" : "properties"}
            </div>

            {filteredProperties.length === 0 ? (
                <Card className="border-dashed">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto bg-muted rounded-full p-3 w-12 h-12 flex items-center justify-center mb-4">
                            <Home className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-xl">No Properties Found</CardTitle>
                        <CardDescription>
                            {searchQuery || selectedCity !== "all" || selectedState !== "all"
                                ? "No properties match your search or filters."
                                : "Add your first property to get started with home management."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center pb-8">
                        <Button variant="outline" onClick={() => setIsPropertyModalOpen(true)}>
                            {searchQuery || selectedCity !== "all" || selectedState !== "all"
                                ? "Clear Filters"
                                : "Add Your First Property"}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProperties.map((property) => {
                        const reportCount = getReportCount(property);
                        return (
                            <Card key={property.id} className="hover:shadow-md transition-shadow relative group">
                                {/* Action buttons column */}
                                <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
                                    {reportCount > 0 && (
                                        <button
                                            onClick={() => handleViewReports(property)}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors cursor-pointer border border-orange-200 dark:border-orange-800/50"
                                            title="Click to view incident reports for this property"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="16" y1="13" x2="8" y2="13" />
                                                <line x1="16" y1="17" x2="8" y2="17" />
                                                <polyline points="10 9 9 9 8 9" />
                                            </svg>
                                            {reportCount} {reportCount === 1 ? "Report" : "Reports"}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleEdit(property)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer border border-blue-200 dark:border-blue-800/50"
                                        title="Edit this property"
                                    >
                                        <Pencil1Icon className="h-3.5 w-3.5" />
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(property)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors cursor-pointer border border-red-200 dark:border-red-800/50"
                                        title="Delete this property"
                                    >
                                        <TrashIcon className="h-3.5 w-3.5" />
                                        Delete
                                    </button>
                                </div>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <Home className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                    </div>
                                    <CardTitle className="mt-3 text-lg">{property.propertyName}</CardTitle>
                                    <CardDescription className="line-clamp-1">{property.address}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                        {property.apartment && <p>{property.apartment}</p>}
                                        <p>{property.city}, {property.state} {property.zip}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <PropertyModal
                isOpen={isPropertyModalOpen}
                onClose={handleModalClose}
                onSuccess={() => {
                    // Listing updates automatically via observeQuery
                }}
                property={editingProperty}
            />

            <DeleteConfirmationDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Property"
                description={`Are you sure you want to delete "${deletingProperty?.propertyName}"? This action cannot be undone.`}
                isDeleting={isDeleting}
            />
        </div>
    );
}
