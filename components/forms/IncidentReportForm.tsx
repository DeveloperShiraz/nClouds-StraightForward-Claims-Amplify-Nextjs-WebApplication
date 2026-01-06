"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { uploadData } from "aws-amplify/storage";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Calendar } from "@/components/ui/Calendar";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/lib/auth/useUserRole";

// Form validation schema
const formSchema = z.object({
  claimNumber: z.string()
    .min(1, "Claim number is required")
    .max(50, "Claim number must be 50 characters or less")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Claim number can only contain letters, numbers, hyphens, and underscores"),
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be 50 characters or less")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be 50 characters or less")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number must be 20 characters or less")
    .regex(/^[\d\s\-\(\)\+\.]+$/, "Phone number can only contain digits, spaces, hyphens, parentheses, plus signs, and periods")
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length >= 10 && val.length <= 15, "Phone number must be between 10 and 15 digits"),
  email: z.string()
    .min(1, "Email is required")
    .max(100, "Email must be 100 characters or less")
    .email("Invalid email address"),
  address: z.string()
    .min(1, "Street address is required")
    .max(200, "Street address must be 200 characters or less"),
  apartment: z.string()
    .max(20, "Apartment/Suite must be 20 characters or less")
    .optional(),
  city: z.string()
    .min(1, "City is required")
    .max(100, "City must be 100 characters or less")
    .regex(/^[a-zA-Z\s'-]+$/, "City can only contain letters, spaces, hyphens, and apostrophes"),
  state: z.string()
    .min(2, "State is required")
    .max(2, "Use 2-letter state code")
    .regex(/^[A-Z]{2}$/, "State must be 2 uppercase letters"),
  zip: z.string()
    .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code (use format: 12345 or 12345-6789)"),
  incidentDate: z.date({
    required_error: "Incident date is required",
  }).refine((date) => date <= new Date(), "Incident date cannot be in the future"),
  description: z.string()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description must be 2000 characters or less"),
  shingleExposure: z.string()
    .optional()
    .refine((val) => {
      if (!val || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Shingle exposure must be between 0 and 100 inches"),
  photos: z.array(z.instanceof(File)).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FileWithPreview extends File {
  preview: string;
}

interface IncidentReportFormProps {
  publicMode?: boolean;
  companyId?: string;
  companyName?: string;
  onSuccess?: () => void;
}

export function IncidentReportForm({
  publicMode = false,
  companyId: propCompanyId,
  companyName: propCompanyName,
  onSuccess,
}: IncidentReportFormProps = {}) {
  const { companyId: userCompanyId, companyName: userCompanyName, userEmail } = useUserRole();

  // Use prop values in public mode, otherwise use user values
  const companyId = publicMode ? propCompanyId : userCompanyId;
  const companyName = publicMode ? propCompanyName : userCompanyName;
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000); // Auto-hide after 5 seconds
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      claimNumber: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      apartment: "",
      city: "",
      state: "",
      zip: "",
      description: "",
      shingleExposure: "",
      photos: [],
    },
  });

  const uploadPhotos = async (photos: FileWithPreview[], claimNumber: string, companyNameForPath: string): Promise<string[]> => {
    // Sanitize company name for use in file path (remove special characters, spaces)
    const sanitizedCompanyName = companyNameForPath.replace(/[^a-zA-Z0-9]/g, '_');

    const uploadPromises = photos.map(async (photo, index) => {
      const timestamp = Date.now();
      const path = `incident-photos/${sanitizedCompanyName}/${claimNumber}/${timestamp}-${index}-${photo.name}`;
      try {
        const result = await uploadData({
          path,
          data: photo,
          options: {
            contentType: photo.type,
          },
        }).result;
        return result.path;
      } catch (error) {
        console.error("Error uploading photo:", error);
        throw error;
      }
    });

    return Promise.all(uploadPromises);
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      console.log("=== FORM SUBMISSION START ===");
      console.log("Submitting form data:", data);
      console.log("Public mode:", publicMode);

      // Verify authentication only if not in public mode
      let session;
      let currentUser;
      if (!publicMode) {
        console.log("Checking authentication...");
        try {
          session = await fetchAuthSession();
          currentUser = await getCurrentUser();
          console.log("✅ Authentication verified:", {
            hasAccessToken: !!session.tokens?.accessToken,
          userId: currentUser.userId,
          username: currentUser.username,
        });
        } catch (authError) {
          console.error("❌ Authentication check failed:", authError);
          throw new Error("You must be signed in to submit an incident report. Please sign in and try again.");
        }

        if (!session?.tokens?.accessToken) {
          throw new Error("No valid authentication token found. Please sign in and try again.");
        }
      }

      // Prepare incident data
      console.log("Preparing incident data...");
      const incidentData = {
        claimNumber: data.claimNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone.replace(/\D/g, ''), // Store only digits
        email: data.email,
        address: data.address,
        apartment: data.apartment || "",
        city: data.city,
        state: data.state,
        zip: data.zip,
        incidentDate: data.incidentDate.toISOString().split('T')[0], // Convert to date string
        description: data.description,
        shingleExposure: data.shingleExposure ? parseFloat(data.shingleExposure) : undefined,
        photoUrls: [],
        companyId: companyId || null,
        companyName: companyName || null,
        submittedBy: publicMode ? data.email : (userEmail || currentUser?.username),
      };

      console.log("Incident data to submit:", JSON.stringify(incidentData, null, 2));

      // Create incident report via API - use public endpoint if in public mode
      console.log("Calling API to create incident report...");
      const apiEndpoint = publicMode ? "/api/public/incident-reports" : "/api/incident-reports";
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(incidentData),
      });

      const result = await response.json();

      console.log("=== API RESPONSE ===");
      console.log("Response status:", response.status);
      console.log("Response data:", result);
      console.log("===================");

      if (!response.ok) {
        throw new Error(result.error || "Failed to create incident report");
      }

      console.log("✅ Success! Created incident report with ID:", result.report?.id || result.reportId);
      const reportId = result.report?.id || result.reportId;

      // Now upload photos with the report ID
      let photoUrls: string[] = [];
      if (files.length > 0) {
        try {
          console.log("Uploading photos for claim:", data.claimNumber);
          console.log("Company:", companyName);
          console.log("Number of files to upload:", files.length);
          console.log("File details:", files.map(f => ({ name: f.name, type: f.type, size: f.size })));
          photoUrls = await uploadPhotos(files, data.claimNumber, companyName || "UnknownCompany");
          console.log("✅ Photos uploaded successfully!");
          console.log("Photo URLs:", photoUrls);

          // Update report with photo URLs via API
          console.log("Updating report with photo URLs...");
          const updateResponse = await fetch(`/api/incident-reports/${reportId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ photoUrls }),
          });

          if (updateResponse.ok) {
            console.log("✅ Report updated with photos");
          }
        } catch (storageError: any) {
          console.error("❌ Photo upload failed!");
          console.error("Error type:", storageError?.constructor?.name);
          console.error("Error message:", storageError?.message);
          console.error("Error details:", storageError);
          console.error("Full error object:", JSON.stringify(storageError, null, 2));
        }
      }

      const successMessage = files.length > 0 && photoUrls.length === 0
        ? "Incident report submitted successfully! (Photos could not be uploaded)"
        : files.length > 0 && photoUrls.length > 0
        ? `Incident report submitted successfully with ${photoUrls.length} photo(s)! ID: ${reportId}`
        : `Incident report submitted successfully! ID: ${reportId}`;

      // Call onSuccess callback if provided (for public mode)
      if (onSuccess) {
        onSuccess();
      } else {
        // Show notification if not in public mode
        showNotification('success', successMessage);
      }

      form.reset();
      setFiles([]);
    } catch (error: any) {
      console.error("=== ERROR DETAILS ===");
      console.error("Error type:", error?.constructor?.name);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      console.error("Full error object:", error);
      console.error("====================");

      const errorMessage = error?.message || String(error) || "Unknown error occurred";
      showNotification('error', `Error submitting incident report: ${errorMessage}. Please check the browser console for details.`);
    } finally {
      setIsSubmitting(false);
      console.log("=== FORM SUBMISSION END ===");
    }
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length >= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    } else if (phoneNumber.length >= 3) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return phoneNumber;
    }
  };

  const handleFiles = (fileList: FileList) => {
    const validFiles: FileWithPreview[] = [];
    
    Array.from(fileList).forEach((file) => {
      // Check file type
      if (file.type === "image/jpeg" || file.type === "image/png") {
        const fileWithPreview = Object.assign(file, {
          preview: URL.createObjectURL(file),
        });
        validFiles.push(fileWithPreview);
      }
    });

    setFiles((prev) => [...prev, ...validFiles]);
    form.setValue("photos", [...files, ...validFiles]);
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    form.setValue("photos", newFiles);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Incident Report Form</h1>
      
      {/* Toast Notification */}
      {notification && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ease-in-out",
            notification.type === 'success'
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          )}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Claim Number */}
          <FormField
            control={form.control}
            name="claimNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Claim Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter claim number (e.g., CLM-2024-001)"
                    maxLength={50}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* First Name / Last Name Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter first name"
                      maxLength={50}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter last name"
                      maxLength={50}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Phone / Email Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="(555) 123-4567" 
                      value={field.value}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value);
                        field.onChange(formatted);
                      }}
                      maxLength={14}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter email address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Address Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Enter street address"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apartment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apartment, Suite (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Apt, Suite, Unit, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* City, State, ZIP Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter city" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="CA" 
                      value={field.value}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().slice(0, 2);
                        field.onChange(value);
                      }}
                      maxLength={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="zip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="12345" 
                      value={field.value}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                        field.onChange(value);
                      }}
                      maxLength={5}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Date of Incident */}
          <FormField
            control={form.control}
            name="incidentDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Incident</FormLabel>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        setDatePickerOpen(false);
                      }}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description of Issue</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Please describe the incident in detail..."
                    className="min-h-[120px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Shingle Exposure */}
          <FormField
            control={form.control}
            name="shingleExposure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shingle Exposure (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="12"
                      placeholder="Enter measurement"
                      {...field}
                      className="pr-16"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                      inches
                    </span>
                  </div>
                </FormControl>
                <p className="text-xs text-gray-500">
                  Height from top to bottom of shingle (0-12 inches)
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* File Upload */}
          <div className="space-y-4">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Upload Photos
            </label>
            
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop your photos here, or{" "}
                <label className="text-primary cursor-pointer hover:underline">
                  browse files
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFiles(e.target.files);
                      }
                    }}
                  />
                </label>
              </p>
              <p className="text-xs text-muted-foreground">
                *Note: We only accept .JPG, .PNG file formats*
              </p>
            </div>

            {/* File Previews */}
            {files.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {files.map((file, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={file.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {file.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </form>
      </Form>
    </div>
  );
}