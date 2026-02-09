
import * as Lucide from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "fs";
import path from "path";

// List of used icons from Icons.tsx
const usedIcons = [
    "Home", "Bell", "Settings", "User", "Mail", "Inbox", "Sun", "Moon",
    "ShieldCheck", "ChevronLeft", "ChevronRight", "Menu", "Plus", "Send", "List",
    "ClipboardCheck", "Clipboard", "Clock", "Building2", "Calendar", "CheckCircle",
    "Briefcase", "Type", "Activity", "Upload", "CheckSquare", "Info", "FileText",
    "Trash2", "FilePlus", "X", "AlertCircle", "UploadCloud", "ShieldAlert", "File",
    "MessageSquare", "Download", "Eye", "Search", "CheckCircle2", "XCircle",
    "RefreshCcw", "RefreshCw", "Circle", "Globe", "MessageCircle", "FileType",
    "Lock", "LogOut", "CreditCard", "ChevronsDown", "ChevronsUp", "Languages",
    "Loader2", "History", "LayoutGrid", "Filter", "Check", "BarChart4", "Monitor",
    "Copy", "ExternalLink", "Zap", "MoreHorizontal", "GripVertical", "PanelLeft",
    "AlertTriangle", "ImageIcon", "Building", "Edit", "Users", "Link", "UserPlus",
    "Shield", "LayoutDashboard", "Code", "Lightbulb", "BrainCircuit", "Database",
    "Key", "ServerCog", "ChevronsUpDown", "BadgeCheck", "Sparkles", "ArrowLeftRight",
    "ArrowRightLeft"
];

// Icons.tsx aliases map (Export Name -> Lucide Name)
const aliases: Record<string, string> = {
    "CalendarIcon": "Calendar",
    "LinkIcon": "Link"
};

const OUTPUT_FILE = path.join(process.cwd(), "components", "IconsReduced.tsx");

function generateIconComponent(name: string, originalName: string) {
    // Get the Lucide component
    const IconComponent = (Lucide as any)[originalName];
    if (!IconComponent) {
        console.warn(`Warning: Icon ${originalName} not found in lucide-react`);
        return `// Missing icon: ${name}`;
    }

    // Render to static markup to get SVG
    // Lucide icons render as <svg ...>...</svg>
    try {
        const html = renderToStaticMarkup(createElement(IconComponent));

        // Extract inner HTML (paths)
        const innerContent = html.replace(/^<svg[^>]*>|<\/svg>$/g, "");

        // Extract attributes if needed, but usually we just want standard Lucide attrs
        // Lucide default: width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"

        return `
export const ${name} = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={cn("lucide lucide-${originalName.toLowerCase()}", className)} 
    {...props}
  >
    ${innerContent}
  </svg>
);`;
    } catch (e) {
        console.error(`Error rendering ${originalName}:`, e);
        return `// Error rendering ${name}`;
    }
}

const header = `import React from "react";
import { cn } from "@/lib/utils";
import {
  MoonIcon,
  SunIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  CircleIcon,
  CheckIcon,
  CaretSortIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Pencil1Icon,
  TrashIcon,
} from "@radix-ui/react-icons";

// Re-export Radix Icons
export {
  MoonIcon,
  SunIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  CircleIcon,
  CheckIcon,
  CaretSortIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Pencil1Icon,
  TrashIcon,
};

export const RadixIcons = {
  MoonIcon,
  SunIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  CircleIcon,
  CheckIcon,
  CaretSortIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Pencil1Icon,
  TrashIcon,
};
`;

let body = "";

// Generate components for direct exports
const processed = new Set<string>();

// 1. Direct exports
usedIcons.forEach(name => {
    if (processed.has(name)) return;
    body += generateIconComponent(name, name) + "\n";
    processed.add(name);
});

// 2. Aliases
Object.entries(aliases).forEach(([alias, original]) => {
    if (processed.has(alias)) return;
    // If we already generated the original, just export alias
    if (processed.has(original)) {
        body += `export const ${alias} = ${original};\n`;
    } else {
        body += generateIconComponent(alias, original) + "\n";
    }
    processed.add(alias);
});

// 3. MaterialIcons object (backward compatibility)
// We need to reconstruct the MaterialIcons object as it was in Icons.tsx
const materialIconsObject = `
export const MaterialIcons = {
  Home,
  Mail,
  Inbox: Inbox,
  Settings,
  NotificationsOutlined: Bell,
  SettingsOutlined: Settings,
  PersonOutlined: User,
  LightModeOutlined: Sun,
  DarkModeOutlined: Moon,
  AdminPanelSettings: ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Menu,
  Add: Plus,
  Send,
  List,
  AssignmentTurnedIn: ClipboardCheck,
  Assignment: Clipboard,
  PendingActions: Clock,
  Person: User,
  Business: Building2,
  Notifications: Bell,
  Schedule: Calendar,
  CheckCircle,
  Work: Briefcase,
  Input: Type,
  DirectionsRun: Activity,
  Upload,
  Beenhere: CheckSquare,
  Info,
  Notes: FileText,
  Summarize: FileText,
  Delete: Trash2,
  ExpandMore: ChevronDownIcon,
  NotificationImportant: AlertCircle,
  Cancel: X,
  FileUpload: UploadCloud,
  LocalPolice: ShieldAlert,
  FilePresent: File,
  Feedback: MessageSquare,
  Download,
  Visibility: Eye,
  SearchOutlined: Search,
  Search,
  Checklist: ClipboardCheck,
  HomeOutlined: Home,
  CheckCircleOutline: CheckCircle2,
  HighlightOffOutlined: XCircle,
  Cached: RefreshCcw,
  Loop: RefreshCw,
  RadioButtonUnchecked: Circle,
  Language: Globe,
  Chat: MessageCircle,
  Description: FileText,
  Lock,
  Logout: LogOut,
  CreditCard,
  KeyboardArrowDown: ChevronsDown,
  KeyboardArrowUp: ChevronsUp,
  Translate: Languages,
  Pending: Loader2,
  Timeline: History,
  ViewWeek: LayoutGrid,
  FilterList: Filter,
  ViewHeadline: List,
  Check,
  WorkOutline: Briefcase,
  Assessment: BarChart4,
  Monitor, 
  Users,
};
`;

const finalContent = header + body + materialIconsObject;

fs.writeFileSync(OUTPUT_FILE, finalContent);
console.log(`Generated ${OUTPUT_FILE}`);
