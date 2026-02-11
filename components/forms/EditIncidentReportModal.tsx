"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { generateClient } from "aws-amplify/data";
import { type Schema } from "@/amplify/data/resource";
import { uploadData, getUrl, remove } from "aws-amplify/storage";
import {
  X,
  Upload,
  Trash2,
  Calendar as CalendarIcon,
  CheckCircle2,
} from "@/components/Icons";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { Calendar } from "@/components/ui/Calendar";
import { cn } from "@/lib/utils";

const client = generateClient<Schema>();

const formSchema = z.object({
  firstName: z.string().min(1, "First Name is required"),
  lastName: z.string().min(1, "Last Name is required"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  email: z.string().email("Invalid email address"),
  address: z.string().min(1, "Street Address is required"),
  apartment: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().length(2, "State must be 2 characters").toUpperCase(),
  zip: z.string().length(5, "ZIP Code must be 5 digits"),
  incidentDate: z.date({ required_error: "Incident Date is required" }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  shingleExposure: z.string().optional(),
  hailSize: z.string().optional(),
  weatherDate: z.date().optional(),
  weatherDescription: z.string().optional(),
  status: z.enum(["submitted", "in_review", "resolved"]).optional(),
  claimNumber: z.string().optional(),
});

interface EditIncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  onUpdate: () => void;
}

export function EditIncidentReportModal({
  isOpen,
  onClose,
  reportId,
  onUpdate,
}: EditIncidentReportModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [photoSignedUrls, setPhotoSignedUrls] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
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
      hailSize: "",
      weatherDescription: "",
      status: "submitted",
      claimNumber: "",
    },
  });

  // Fetch report data
  useEffect(() => {
    const fetchReport = async () => {
      if (!isOpen || !reportId) return;

      setIsLoading(true);
      try {
        const { data: report, errors } = await client.models.IncidentReport.get({
          id: reportId,
        });

        if (errors) throw new Error(errors[0].message);
        if (!report) throw new Error("Report not found");

        const parsedPhotos = report.photoUrls?.filter((url): url is string => !!url) || [];
        setExistingPhotos(parsedPhotos);

        // Fetch signed URLs for existing photos
        const signedUrls = await Promise.all(
          parsedPhotos.map(async (path: string) => {
            const result = await getUrl({ path });
            return result.url.toString();
          })
        );
        setPhotoSignedUrls(signedUrls);

        let weatherData: any = {};
        try {
          if (report.weatherReport) {
            weatherData = typeof report.weatherReport === 'string'
              ? JSON.parse(report.weatherReport)
              : report.weatherReport;
          }
        } catch (e) {
          console.error("Failed to parse weather report", e);
        }

        form.reset({
          firstName: report.firstName || "",
          lastName: report.lastName || "",
          phone: report.phone || "",
          email: report.email || "",
          address: report.address || "",
          apartment: report.apartment || "",
          city: report.city || "",
          state: report.state || "",
          zip: report.zip || "",
          incidentDate: report.incidentDate ? new Date(report.incidentDate) : undefined,
          description: report.description || "",
          shingleExposure: report.shingleExposure?.toString() || "",
          hailSize: weatherData.reported_hail_size_inches?.toString() || "",
          weatherDate: weatherData.weather_date ? new Date(weatherData.weather_date) : undefined,
          weatherDescription: weatherData.weather_description || "",
          status: (report.status as "submitted" | "in_review" | "resolved") || "submitted",
          claimNumber: report.claimNumber || "",
        });
      } catch (error) {
        console.error("Error fetching report:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [isOpen, reportId, form]);

  const handleAddNewPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const validFiles = filesArray.filter((file) => {
        const isValidType = ["image/jpeg", "image/png", "image/gif"].includes(
          file.type
        );
        return isValidType;
      });

      if (existingPhotos.length + newPhotos.length + validFiles.length > 20) {
        alert("Maximum 20 photos allowed.");
        return;
      }

      setNewPhotos((prev) => [...prev, ...validFiles]);
    }
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteExistingPhoto = (path: string, index: number) => {
    setPhotosToDelete((prev) => [...prev, path]);
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoSignedUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      // 1. Delete removed photos from S3
      await Promise.all(
        photosToDelete.map(async (path) => {
          try {
            await remove({ path });
          } catch (err) {
            console.error("Error deleting photo:", path, err);
          }
        })
      );

      // 2. Upload new photos
      const uploadedPhotoPaths: string[] = [];
      const limitedNewPhotos = newPhotos.slice(
        0,
        20 - existingPhotos.length
      );

      for (const file of limitedNewPhotos) {
        try {
          const timestamp = Date.now();
          const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
          const key = `incident-photos/${timestamp}-${cleanFileName}`;

          await uploadData({
            path: key,
            data: file,
            options: {
              contentType: file.type,
            },
          }).result;

          uploadedPhotoPaths.push(key);
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
        }
      }

      const finalPhotos = [...existingPhotos, ...uploadedPhotoPaths];

      // 3. Update IncidentReport record
      await client.models.IncidentReport.update({
        id: reportId,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        email: values.email,
        address: values.address,
        apartment: values.apartment,
        city: values.city,
        state: values.state,
        zip: values.zip,
        incidentDate: values.incidentDate.toISOString().split("T")[0],
        description: values.description,
        photoUrls: finalPhotos,
        shingleExposure: values.shingleExposure ? parseFloat(values.shingleExposure) : null,
        weatherReport: JSON.stringify({
          reported_hail_size_inches: values.hailSize ? parseFloat(values.hailSize) : undefined,
          weather_date: values.weatherDate
            ? values.weatherDate.toISOString().split("T")[0]
            : undefined,
          weather_description: values.weatherDescription,
        }),
        status: values.status,
        claimNumber: values.claimNumber,
      });

      onUpdate();
      onClose();
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
      <div className="bg-white dark:bg-slate-950 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-50">Edit Incident Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-slate-400 dark:hover:text-slate-200 hover:text-gray-600 transition-colors"
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
                  <FormLabel className="dark:text-slate-200">Claim Number</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">First Name</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Last Name</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Phone Number</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Email</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Street Address</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Apt/Unit (Optional)</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">City</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">State</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">ZIP Code</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Incident Date</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className={cn(!field.value && "text-muted-foreground", "dark:text-slate-200 dark:border-slate-700")}>
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
                  <FormLabel className="dark:text-slate-200">Incident Description</FormLabel>
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

            <div className="space-y-4 border-t border-gray-200 dark:border-slate-800 pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-slate-200">Property Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="shingleExposure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="dark:text-slate-200">Shingle Exposure (Optional)</FormLabel>
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
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-slate-400">
                            inches
                          </span>
                        </div>
                      </FormControl>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Height from top to bottom of shingle (0-12 inches)
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4 border-t border-gray-200 dark:border-slate-800 pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-slate-200">Weather Information (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hailSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="dark:text-slate-200">Hail Size</FormLabel>
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
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-slate-400">
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
                      <FormLabel className="dark:text-slate-200">Weather Date</FormLabel>
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
                    <FormLabel className="dark:text-slate-200">Weather Description</FormLabel>
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
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-200 mb-3">Incident Photos</h3>

                {/* Existing Photos */}
                {photoSignedUrls.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">Current Photos</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {photoSignedUrls.map((signedUrl, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={signedUrl}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteExistingPhoto(existingPhotos[index], index)}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 text-center">Photo {index + 1}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Photos Preview */}
                {newPhotos.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">New Photos to Upload</p>
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
                          <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 text-center">New {index + 1}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload New Photos Button */}
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-slate-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors">
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
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    *Only .JPG, .PNG, .GIF allowed &bull; Max 20 images total*
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {photoSignedUrls.length + newPhotos.length} photo(s) total
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
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
