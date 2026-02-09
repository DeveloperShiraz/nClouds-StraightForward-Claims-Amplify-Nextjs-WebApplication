"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { CalendarIcon, X, Upload, Trash2 } from "lucide-react";
import { getUrl, uploadData, remove } from "aws-amplify/storage";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Calendar } from "@/components/ui/Calendar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

const editIncidentReportSchema = z.object({
  claimNumber: z.string()
    .min(1, "Claim number is required")
    .max(50, "Claim number must be 50 characters or less")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Claim number can only contain letters, numbers, hyphens, and underscores"),
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
  email: z.string().email("Invalid email address"),
  address: z.string().min(5, "Address is required"),
  apartment: z.string().optional(),
  city: z.string().min(2, "City is required"),
  state: z.string().length(2, "State must be 2 characters (e.g., TX)"),
  zip: z.string().regex(/^\d{5}$/, "ZIP must be 5 digits"),
  incidentDate: z.date(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  shingleExposure: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 12),
      "Shingle exposure must be between 0 and 12 inches"),
  hailSize: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 10),
      "Hail size must be between 0 and 10 inches"),
  weatherDate: z.date().optional().refine((date) => !date || date <= new Date(), "Weather date cannot be in the future"),
  weatherDescription: z.string().max(500, "Weather description must be 500 characters or less").optional(),
  status: z.enum(["submitted", "in_review", "resolved"]).optional(),
});

type EditIncidentReportFormData = z.infer<typeof editIncidentReportSchema>;

interface IncidentReport {
  id: string;
  claimNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  apartment?: string;
  city: string;
  state: string;
  zip: string;
  incidentDate: string;
  description: string;
  shingleExposure?: number;
  weatherReport?: string | any; // JSON string or object
  photoUrls?: string[];
  status?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  submittedBy?: string;
}

interface EditIncidentReportModalProps {
  report: IncidentReport;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditIncidentReportModal({
  report,
  isOpen,
  onClose,
  onSuccess,
}: EditIncidentReportModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [photoSignedUrls, setPhotoSignedUrls] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [deletedPhotos, setDeletedPhotos] = useState<string[]>([]);

  // Helper to parse weather report safely
  const parseWeatherReport = (reportData: any) => {
    try {
      if (!reportData) return {};
      return typeof reportData === 'string' ? JSON.parse(reportData) : reportData;
    } catch (e) {
      console.error("Failed to parse weather report for edit:", e);
      return {};
    }
  };

  const form = useForm<EditIncidentReportFormData>({
    resolver: zodResolver(editIncidentReportSchema),
    defaultValues: {
      claimNumber: report.claimNumber,
      firstName: report.firstName,
      lastName: report.lastName,
      phone: report.phone.replace(/\D/g, ''),
      email: report.email,
      address: report.address,
      apartment: report.apartment || "",
      city: report.city,
      state: report.state,
      zip: report.zip.replace(/\D/g, ''),
      incidentDate: new Date(report.incidentDate),
      description: report.description,
      shingleExposure: report.shingleExposure ? report.shingleExposure.toString() : "",
      hailSize: "", // Will be set in useEffect
      weatherDate: undefined, // Will be set in useEffect
      weatherDescription: "", // Will be set in useEffect
      status: (report.status as "submitted" | "in_review" | "resolved") || "submitted",
    },
  });

  useEffect(() => {
    if (isOpen) {
      const weatherData = parseWeatherReport(report.weatherReport);

      // Reset form with report data when modal opens
      form.reset({
        claimNumber: report.claimNumber,
        firstName: report.firstName,
        lastName: report.lastName,
        phone: report.phone.replace(/\D/g, ''),
        email: report.email,
        address: report.address,
        apartment: report.apartment || "",
        city: report.city,
        state: report.state,
        zip: report.zip.replace(/\D/g, ''),
        incidentDate: new Date(report.incidentDate),
        description: report.description,
        shingleExposure: report.shingleExposure ? report.shingleExposure.toString() : "",
        hailSize: weatherData.reported_hail_size_inches ? weatherData.reported_hail_size_inches.toString() : "",
        weatherDate: weatherData.weather_date ? new Date(weatherData.weather_date) : undefined,
        weatherDescription: weatherData.weather_description || "",
        status: (report.status as "submitted" | "in_review" | "resolved") || "submitted",
      });

      // Initialize photos
      setExistingPhotos(report.photoUrls || []);
      setNewPhotos([]);
      setDeletedPhotos([]);

      // Fetch signed URLs for existing photos
      const fetchSignedUrls = async () => {
        if (report.photoUrls && report.photoUrls.length > 0) {
          try {
            const urlPromises = report.photoUrls.map(async (path) => {
              try {
                const result = await getUrl({ path });
                return result.url.toString();
              } catch (error) {
                console.error(`Error getting URL for ${path}:`, error);
                return null;
              }
            });
            const urls = await Promise.all(urlPromises);
            setPhotoSignedUrls(urls.filter((url): url is string => url !== null));
          } catch (error) {
            console.error("Error fetching signed URLs:", error);
          }
        } else {
          setPhotoSignedUrls([]);
        }
      };

      fetchSignedUrls();
    }
  }, [isOpen, report, form]);

  const handleDeleteExistingPhoto = async (photoPath: string, index: number) => {
    if (!confirm("Are you sure you want to delete this photo?")) {
      return;
    }

    try {
      // Mark photo for deletion
      setDeletedPhotos([...deletedPhotos, photoPath]);

      // Remove from UI
      const newExistingPhotos = existingPhotos.filter((p) => p !== photoPath);
      const newSignedUrls = [...photoSignedUrls];
      newSignedUrls.splice(index, 1);

      setExistingPhotos(newExistingPhotos);
      setPhotoSignedUrls(newSignedUrls);

      console.log(`Marked photo for deletion: ${photoPath}`);
    } catch (error) {
      console.error("Error marking photo for deletion:", error);
      alert("Failed to delete photo. Please try again.");
    }
  };

  const handleAddNewPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const MAX_TOTAL_FILES = 20;
      const currentTotal = existingPhotos.length + newPhotos.length;
      const remainingSlots = MAX_TOTAL_FILES - currentTotal;

      if (remainingSlots <= 0) {
        alert("Maximum limit of 20 images reached.");
        return;
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
      let fileArray = Array.from(files).filter(file => allowedTypes.includes(file.type));

      if (fileArray.length > remainingSlots) {
        alert(`Only the first ${remainingSlots} valid files were added. Maximum limit is 20 images total.`);
        fileArray = fileArray.slice(0, remainingSlots);
      } else if (fileArray.length < files.length) {
        alert("Some files were skipped. Only JPEG, PNG, and GIF are allowed.");
      }

      setNewPhotos([...newPhotos, ...fileArray]);
    }
  };

  const handleRemoveNewPhoto = (index: number) => {
    const updatedPhotos = [...newPhotos];
    updatedPhotos.splice(index, 1);
    setNewPhotos(updatedPhotos);
  };

  const onSubmit = async (data: EditIncidentReportFormData) => {
    setIsSubmitting(true);
    try {
      console.log("Updating incident report:", report.id);

      // Step 1: Delete removed photos from S3
      if (deletedPhotos.length > 0) {
        console.log(`Deleting ${deletedPhotos.length} photos from S3...`);
        const deletePromises = deletedPhotos.map(async (photoPath) => {
          try {
            await remove({ path: photoPath });
            console.log(`✅ Deleted photo: ${photoPath}`);
          } catch (error) {
            console.error(`Failed to delete photo ${photoPath}:`, error);
          }
        });
        await Promise.all(deletePromises);
      }

      // Step 2: Upload new photos to S3
      let newPhotoUrls: string[] = [];
      if (newPhotos.length > 0) {
        console.log(`Uploading ${newPhotos.length} new photos to S3...`);
        const uploadPromises = newPhotos.map(async (photo, index) => {
          const path = `incident-photos/${report.id}/${Date.now()}-${index}-${photo.name}`;
          try {
            const result = await uploadData({
              path,
              data: photo,
              options: {
                contentType: photo.type,
              },
            }).result;
            console.log(`✅ Uploaded photo: ${result.path}`);
            return result.path;
          } catch (error) {
            console.error("Error uploading photo:", error);
            throw error;
          }
        });
        newPhotoUrls = await Promise.all(uploadPromises);
      }

      // Step 3: Calculate final photoUrls array (existing - deleted + new)
      const finalPhotoUrls = [
        ...existingPhotos.filter(p => !deletedPhotos.includes(p)),
        ...newPhotoUrls
      ];

      // Step 4: Update the report in DynamoDB via API
      const updateData = {
        claimNumber: data.claimNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone.replace(/\D/g, ''),
        email: data.email,
        address: data.address,
        apartment: data.apartment || "",
        city: data.city,
        state: data.state,
        zip: data.zip,
        incidentDate: data.incidentDate.toISOString().split('T')[0],
        description: data.description,
        shingleExposure: data.shingleExposure ? parseFloat(data.shingleExposure) : undefined,
        weatherReport: JSON.stringify({
          reported_hail_size_inches: data.hailSize ? parseFloat(data.hailSize) : null,
          weather_date: data.weatherDate ? data.weatherDate.toISOString() : null,
          weather_description: data.weatherDescription || ""
        }),
        status: data.status,
        photoUrls: finalPhotoUrls,
      };

      const response = await fetch(`/api/incident-reports/${report.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (response.ok) {
        console.log("✅ Successfully updated incident report");
        onSuccess();
        onClose();
      } else {
        console.error("❌ Error updating report:", result.error);
        alert(`Failed to update report: ${result.error}`);
      }
    } catch (error: any) {
      console.error("Error updating report:", error);
      alert(`Error updating report: ${error?.message || "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPhoneNumber = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');
    if (phoneNumber.length <= 3) return phoneNumber;
    if (phoneNumber.length <= 6)
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Edit Incident Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Claim Number */}
            <FormField
              control={form.control}
              name="claimNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Claim Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="CLM-2024-001"
                      maxLength={50}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
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
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(555) 555-5555"
                        {...field}
                        value={formatPhoneNumber(field.value)}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\D/g, '');
                          field.onChange(cleaned);
                        }}
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
                      <Input placeholder="john.doe@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" {...field} />
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
                    <FormLabel>Apt/Unit (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Apt 4B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Houston" {...field} />
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
                      <Input placeholder="TX" maxLength={2} {...field} />
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
                        placeholder="77001"
                        maxLength={5}
                        {...field}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\D/g, '');
                          field.onChange(cleaned);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="incidentDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Incident Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              field.value.toLocaleDateString("en-US", { dateStyle: "long" })
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
                          onSelect={field.onChange}
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

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Incident Description</FormLabel>
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

            <div className="space-y-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700">Property Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </div>

            <div className="space-y-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700">Weather Information (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hailSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hail Size</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.25"
                            min="0"
                            max="10"
                            placeholder="0.00"
                            {...field}
                            className="pr-16"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                            inches
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="weatherDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weather Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={`w-full pl-3 text-left font-normal ${!field.value ? "text-muted-foreground" : ""}`}
                            >
                              {field.value ? (
                                field.value.toLocaleDateString("en-US", { dateStyle: "long" })
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
                            onSelect={field.onChange}
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
              </div>

              <FormField
                control={form.control}
                name="weatherDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weather Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe weather conditions (e.g., 'Heavy hail storm with high winds')..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Photo Management Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Incident Photos</h3>

                {/* Existing Photos */}
                {photoSignedUrls.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">Current Photos</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {photoSignedUrls.map((signedUrl, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={signedUrl}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteExistingPhoto(existingPhotos[index], index)}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <p className="text-xs text-gray-600 mt-1 text-center">Photo {index + 1}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Photos Preview */}
                {newPhotos.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">New Photos to Upload</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {newPhotos.map((photo, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={URL.createObjectURL(photo)}
                            alt={`New photo ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-blue-300"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveNewPhoto(index)}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <p className="text-xs text-gray-600 mt-1 text-center">New {index + 1}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload New Photos Button */}
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm font-medium">Add Photos</span>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.gif"
                      onChange={handleAddNewPhotos}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500">
                    *Only .JPG, .PNG, .GIF allowed &bull; Max 20 images total*
                  </p>
                  <p className="text-xs text-gray-500">
                    {photoSignedUrls.length + newPhotos.length} photo(s) total
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
