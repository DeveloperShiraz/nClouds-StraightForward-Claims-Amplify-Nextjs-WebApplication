"use client";

import { useState } from "react";
import Heading from "@/components/ui/Heading";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Settings, FileText, RefreshCw } from "@/components/Icons";

export default function JobManagementPage() {
    return (
        <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <Heading size="sm" className="text-foreground">
                    Job Management
                </Heading>
            </div>

            {/* Placeholder content */}
            <Card className="border-dashed">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto bg-muted rounded-full p-3 w-12 h-12 flex items-center justify-center mb-4">
                        <Settings className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-xl">Job Management</CardTitle>
                    <CardDescription>
                        Manage your assigned jobs, view work orders, and track project progress.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center pb-8">
                    <p className="text-sm text-muted-foreground">
                        This feature is coming soon. Check back later for updates.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
