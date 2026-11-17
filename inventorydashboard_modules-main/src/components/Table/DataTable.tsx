import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCollection } from "../../hooks/useCollections";
import TableRowActions from "./TableRowActions";
import ColumnToggle from "./ColumnToggle";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import {
  Search,
  X,
  LayoutGrid,
  Plus,
  RefreshCw,
  Download,
  Upload,
  ChevronDown,
  Check,
  Calendar,
  FileSpreadsheet,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";

interface DataTableProps<T extends { id?: string }> {
  title: string;
  collectionPath?: string;
  data?: T[];
  loading?: boolean;
  columns: ColumnDef<T>[];
  onAdd?: () => void;
  onEdit?: (record: T) => void;
  onDelete?: (item: T) => void;
  onView?: (item: T) => void;
  hideImportExport?: boolean;
  hideAdd?: boolean;
  extraToolbar?: React.ReactNode;
  viewColumns?: ColumnDef<T>[];
  defaultVisibleColumnIds?: string[];
  sumColumn?: string;
  sumLabel?: string;
  filteredTotal?: number | null;
  filteredTotalLabel?: string;
  showIndexColumn?: boolean;
  indexStart?: number;
  columnUniqueValues?: Record<string, string[]>;
  disableInternalFiltering?: boolean;
  columnSearchValues?: Record<string, string>;
  dateRangeValues?: Record<string, { from: string; to: string }>;
  onColumnSearchChange?: (key: string, value: string) => void;
  onDateRangeChange?: (key: string, range: { from: string; to: string }) => void;
  totalRecords?: number;
  onExportAllPages?: (dateRange?: { from: string; to: string }) => Promise<T[]>;
  headerBgColor?: string;
}

interface ExportFilter {
  type: "string" | "number" | "date" | "boolean";
  min?: string;
  max?: string;
  search?: string;
  enabled: boolean;
  uniqueValues?: string[];
}

export default function DataTable<T extends { id?: string }>(
  props: DataTableProps<T>
) {
  const {
    title,
    collectionPath,
    data: dataProp,
    loading: loadingProp,
    columns,
    viewColumns,
    onAdd,
    onEdit,
    onDelete,
    onView,
    hideImportExport = false,
    hideAdd = false,
    extraToolbar,
    defaultVisibleColumnIds,
    sumColumn,
    sumLabel = "Total",
    filteredTotal,
    filteredTotalLabel = "Total (Filtered)",
    showIndexColumn = true,
    indexStart = 1,
    columnUniqueValues = {},
    disableInternalFiltering = false,
    columnSearchValues = {},
    dateRangeValues = {},
    onColumnSearchChange,
    onDateRangeChange,
    totalRecords,
    onExportAllPages,
    headerBgColor,
  } = props;

  const { data: collData, loading: collLoading, create, remove } =
    useCollection<T>(collectionPath);

  const rows: T[] = Array.isArray(dataProp)
    ? dataProp
    : Array.isArray(collData)
      ? collData
      : [];
  const loading =
    typeof loadingProp === "boolean" ? loadingProp : collLoading;

  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [searchDropdown, setSearchDropdown] = useState<string | null>(null);
  const [dateRangeFilters, setDateRangeFilters] = useState<Record<string, { from: string; to: string }>>({});
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [viewData, setViewData] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);
  const [exportModal, setExportModal] = useState(false);
  const [exportFilters, setExportFilters] = useState<
    Record<string, ExportFilter>
  >({});
  const [exportColumns, setExportColumns] = useState<Record<string, boolean>>(
    {}
  );
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [filteredValues, setFilteredValues] = useState<
    Record<string, string[]>
  >({});
  
  const [exportMode, setExportMode] = useState<"current" | "all" | "datewise">("current");
  const [datewiseColumn, setDatewiseColumn] = useState<string>("");
  const [datewiseRange, setDatewiseRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportAllData, setExportAllData] = useState<T[] | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatValue = (value: any) => {
    if (value instanceof Timestamp) {
      return value.toDate().toLocaleString();
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    if (value && typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value ?? "");
  };

  // Function to get unique values for a column
  const getUniqueValues = (columnId: string): string[] => {
    const values = new Set<string>();
    rows.forEach((row) => {
      const value = (row as any)[columnId];
      if (value !== undefined && value !== null) {
        const formattedValue = formatValue(value);
        if (formattedValue.trim() !== "") {
          values.add(formattedValue);
        }
      }
    });
    return Array.from(values).sort();
  };

  // Detect column types (string, number, date, boolean)
  const columnTypes = useMemo(() => {
    const types: Record<string, 'string' | 'number' | 'date' | 'boolean'> = {};
    if (rows.length > 0) {
      columns.forEach(col => {
        const colId = (col.id ?? (col as any).accessorKey) as string;
        if (colId && colId !== 'sr' && colId !== 'actions') {
          const sampleValue = rows[0] ? (rows[0] as any)[colId] : null;
          if (sampleValue instanceof Date || sampleValue instanceof Timestamp) {
            types[colId] = 'date';
          } else if (typeof sampleValue === 'number') {
            types[colId] = 'number';
          } else if (typeof sampleValue === 'boolean') {
            types[colId] = 'boolean';
          } else {
            types[colId] = 'string';
          }
        }
      });
    }
    return types;
  }, [rows, columns]);

  // Get date columns for date-wise export (now used only for sorting)
  const getDateColumns = useMemo(() => {
    return columns.filter(col => {
      const colId = (col.id ?? (col as any).accessorKey) as string;
      return colId && columnTypes[colId] === 'date';
    }).map(col => ({
      id: (col.id ?? (col as any).accessorKey) as string,
      header: col.header as string
    }));
  }, [columns, columnTypes]);

  // Filter unique values based on search input
  const filterUniqueValues = (columnId: string, searchText: string): string[] => {
    const uniqueValues = exportFilters[columnId]?.uniqueValues || [];
    if (!searchText) return uniqueValues;

    const searchLower = searchText.toLowerCase();
    return uniqueValues.filter((value) =>
      value.toLowerCase().startsWith(searchLower)
    );
  };

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node)
      ) {
        setSearchDropdown(null);
      }
    };

    if (searchDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchDropdown]);

  // Initialize export filters and columns
  useEffect(() => {
    if (exportModal && rows.length > 0) {
      const initialFilters: Record<string, ExportFilter> = {};
      const initialColumns: Record<string, boolean> = {};
      const initialFilteredValues: Record<string, string[]> = {};

      columns.forEach((col) => {
        const colId = (col.id ?? (col as any).accessorKey) as string | undefined;
        if (colId && colId !== "sr" && colId !== "actions") {
          const sampleValue = rows[0] ? (rows[0] as any)[colId] : null;
          let type: "string" | "number" | "date" | "boolean" = "string";

          if (sampleValue !== undefined && sampleValue !== null) {
            if (typeof sampleValue === "number") {
              type = "number";
            } else if (
              sampleValue instanceof Date ||
              sampleValue instanceof Timestamp
            ) {
              type = "date";
            } else if (typeof sampleValue === "boolean") {
              type = "boolean";
            } else {
              type = "string";
            }
          }

          const uniqueValues = type === "string" ? getUniqueValues(colId) : [];

          initialFilters[colId] = {
            type,
            enabled: false,
            search: "",
            min: "",
            max: "",
            uniqueValues: uniqueValues,
          };
          initialColumns[colId] = true;
          initialFilteredValues[colId] = uniqueValues;
        }
      });

      setExportFilters(initialFilters);
      setExportColumns(initialColumns);
      setFilteredValues(initialFilteredValues);
      
      // Set default date column for date-wise export
      const firstDateCol = getDateColumns[0];
      if (firstDateCol) {
        setDatewiseColumn(firstDateCol.id);
      }

      // Reset all data cache when modal opens
      setExportAllData(null);
    }
  }, [exportModal, columns, rows, getDateColumns]);

  // Reset export mode when modal closes
  useEffect(() => {
    if (!exportModal) {
      setExportMode("current");
      setExportAllData(null);
    }
  }, [exportModal]);

  // Prevent background page from scrolling when modal is open
  useEffect(() => {
    if (viewData || confirmDelete || showColumnsModal || exportModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [viewData, confirmDelete, showColumnsModal, exportModal]);

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => {
      if (defaultVisibleColumnIds && defaultVisibleColumnIds.length > 0) {
        return columns.reduce<Record<string, boolean>>((acc, c) => {
          const cid = (c.id ?? (c as any).accessorKey) as string | undefined;
          if (cid) {
            acc[cid] = defaultVisibleColumnIds.includes(cid);
          }
          return acc;
        }, {});
      }

      const allColIds = columns
        .map((c) => (c.id ?? (c as any).accessorKey) as string | undefined)
        .filter(Boolean) as string[];

      const nameCol = allColIds.find((id) =>
        id.toLowerCase().includes("name")
      );
      const defaultVisibleSet = new Set<string>();
      if (nameCol) defaultVisibleSet.add(nameCol);
      for (const id of allColIds) {
        if (defaultVisibleSet.size >= 5) break;
        defaultVisibleSet.add(id);
      }

      return columns.reduce<Record<string, boolean>>((acc, c) => {
        const cid = (c.id ?? (c as any).accessorKey) as string | undefined;
        if (cid) acc[cid] = defaultVisibleSet.has(cid);
        return acc;
      }, {});
    }
  );

  const filteredData = useMemo(() => {
    if (disableInternalFiltering) {
      return rows;
    }

    return rows.filter((row) => {
      const textMatch = Object.entries(columnSearch).every(([key, query]) => {
        if (!query) return true;
        const v = (row as any)[key];
        return formatValue(v).toLowerCase() === query.toLowerCase();
      });
      if (!textMatch) return false;

      const dateRangeMatch = Object.entries(dateRangeFilters).every(([key, range]) => {
        if (!range.from && !range.to) return true;
        const v = (row as any)[key];
        if (!v) return false;
        let dateValue: Date;
        if (v instanceof Timestamp) dateValue = v.toDate();
        else if (v instanceof Date) dateValue = v;
        else dateValue = new Date(v);
        if (isNaN(dateValue.getTime())) return false;
        if (range.from && dateValue < new Date(range.from)) return false;
        if (range.to) {
          const toDate = new Date(range.to);
          toDate.setHours(23, 59, 59, 999);
          if (dateValue > toDate) return false;
        }
        return true;
      });
      return dateRangeMatch;
    });
  }, [rows, columnSearch, dateRangeFilters, disableInternalFiltering]);

  const totalSum = useMemo(() => {
    if (!sumColumn) return null;
    return filteredData.reduce((acc, row) => {
      const val = (row as any)[sumColumn];
      const num = Number(val);
      return acc + (isNaN(num) ? 0 : num);
    }, 0);
  }, [filteredData, sumColumn]);

  const baseTableColumns = useMemo(
    () =>
      columns.filter((c) => {
        const cid = (c.id ?? (c as any).accessorKey) as string | undefined;
        return cid ? !!visibleCols[cid] : true;
      }),
    [columns, visibleCols]
  );

  const tableColumns: ColumnDef<T>[] = useMemo(() => {
    const columnsToUse = [...baseTableColumns];

    if (showIndexColumn) {
      const srColumn: ColumnDef<T> = {
        id: "sr",
        header: "Sr.",
        cell: ({ row }) => indexStart + row.index,
      };
      columnsToUse.unshift(srColumn);
    }

    const actionsColumn: ColumnDef<T> = {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <TableRowActions
          row={row.original}
          onView={() => (onView ? onView(row.original) : setViewData(row.original))}
          onEdit={() => onEdit?.(row.original)}
          onDelete={() => setConfirmDelete(row.original)}
        />
      ),
    };

    columnsToUse.push(actionsColumn);
    return columnsToUse;
  }, [baseTableColumns, onEdit, onView, showIndexColumn, indexStart]);

  const table = useReactTable<T>({
    data: filteredData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const toggleCol = (id: string) =>
    setVisibleCols((s) => ({ ...s, [id]: !s[id] }));

  const handleImport = async (file: File | null) => {
    if (!file) return;
    if (!collectionPath) {
      console.warn("Import skipped: no collectionPath provided");
      return;
    }
    const dataBuf = await file.arrayBuffer();
    const wb = XLSX.read(dataBuf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    for (const row of json) {
      await create({
        ...(row as any),
        insertedOn: new Date().toISOString(),
      } as any);
    }
  };

  const applyExportFilters = (data: T[]): T[] => {
    return data.filter((row) => {
      return Object.entries(exportFilters).every(([columnId, filter]) => {
        if (!filter.enabled) return true;

        const value = (row as any)[columnId];
        if (value === undefined || value === null) return false;

        switch (filter.type) {
          case "number": {
            const numValue =
              typeof value === "string" ? parseFloat(value) : Number(value);
            if (isNaN(numValue)) return false;

            const min = filter.min ? parseFloat(filter.min) : -Infinity;
            const max = filter.max ? parseFloat(filter.max) : Infinity;
            return numValue >= min && numValue <= max;
          }

          case "date": {
            let dateValue: Date;
            if (value instanceof Timestamp) {
              dateValue = value.toDate();
            } else if (value instanceof Date) {
              dateValue = value;
            } else {
              dateValue = new Date(value);
            }

            if (isNaN(dateValue.getTime())) return false;

            const min = filter.min
              ? new Date(filter.min)
              : new Date(-8640000000000000);
            const max = filter.max
              ? new Date(filter.max)
              : new Date(8640000000000000);

            return dateValue >= min && dateValue <= max;
          }

          case "string": {
            const strValue = String(value).toLowerCase();
            const search = filter.search?.toLowerCase() || "";
            return strValue.includes(search);
          }

          case "boolean": {
            const boolValue = Boolean(value);
            const search = filter.search?.toLowerCase() || "";
            if (search === "true" || search === "false") {
              return boolValue === (search === "true");
            }
            return true;
          }

          default:
            return true;
        }
      });
    });
  };

  // Fetch all pages data when needed
  const fetchAllPagesData = async (dateRange?: { from: string; to: string }): Promise<T[]> => {
    // Clear cache when fetching with date range to ensure fresh data
    if (dateRange) {
      setExportAllData(null);
    }

    if (exportAllData && !dateRange) {
      return exportAllData;
    }

    if (!onExportAllPages) {
      throw new Error("onExportAllPages callback is not provided");
    }

    setIsExportingAll(true);
    try {
      const allData = await onExportAllPages(dateRange);
      // Only cache if no date range (full export)
      if (!dateRange) {
        setExportAllData(allData);
      }
      return allData;
    } catch (error) {
      console.error("Failed to fetch all pages:", error);
      throw error;
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExport = async () => {
  let dataToExport: T[] = [];

  // For both "all" and "datewise" modes, fetch all data
  if (exportMode === "all" || exportMode === "datewise") {
    try {
      let dateRange: { from: string; to: string } | undefined;

      if (exportMode === "datewise") {
        if (!datewiseRange.from || !datewiseRange.to) {
          alert("Please select both From and To dates for date range export");
          return;
        }
        dateRange = {
          from: datewiseRange.from,
          to: datewiseRange.to,
        };
      }

      dataToExport = await fetchAllPagesData(dateRange);

      if (!dataToExport || dataToExport.length === 0) {
        alert(
          exportMode === "datewise"
            ? "No records found in the selected date range"
            : "No data found for export"
        );
        return;
      }

      if (exportMode === "datewise" && datewiseColumn) {
        dataToExport.sort((a, b) => {
          const dateA = (a as any)[datewiseColumn];
          const dateB = (b as any)[datewiseColumn];
          let dateAValue: Date, dateBValue: Date;

          if (dateA instanceof Timestamp) dateAValue = dateA.toDate();
          else if (dateA instanceof Date) dateAValue = dateA;
          else dateAValue = new Date(dateA);

          if (dateB instanceof Timestamp) dateBValue = dateB.toDate();
          else if (dateB instanceof Date) dateBValue = dateB;
          else dateBValue = new Date(dateB);

          return dateAValue.getTime() - dateBValue.getTime();
        });
      }
    } catch (error) {
      alert("Failed to fetch data. Please try again.");
      return;
    }
  } else {
    dataToExport = rows;
  }

  const filteredExportData = applyExportFilters(dataToExport);

  if (filteredExportData.length === 0) {
    alert("No records to export after applying filters");
    return;
  }

  const selectedColumns = Object.entries(exportColumns)
    .filter(([_, selected]) => selected)
    .map(([colId]) => colId);

  if (selectedColumns.length === 0) {
    alert("Please select at least one column to export");
    return;
  }

  // Format data for export with truncation
  const exportData = filteredExportData.map((item) => {
    const filteredItem: any = {};
    selectedColumns.forEach((colId) => {
      const value = (item as any)[colId];
      
      // Handle different value types
      let formattedValue: any;
      
      if (value instanceof Timestamp) {
        formattedValue = value.toDate().toISOString();
      } else if (value instanceof Date) {
        formattedValue = value.toISOString();
      } else if (value && typeof value === 'object') {
        // Convert objects/arrays to JSON string
        try {
          formattedValue = JSON.stringify(value);
        } catch {
          formattedValue = String(value);
        }
      } else {
        formattedValue = value;
      }

      // Truncate if string length exceeds Excel limit (32767 characters)
      // Use 32750 to leave a buffer
      if (typeof formattedValue === 'string' && formattedValue.length > 32750) {
        formattedValue = formattedValue.substring(0, 32750) + '... (truncated)';
      }

      filteredItem[colId] = formattedValue;
    });
    return filteredItem;
  });

  // Create single sheet with proper cell formatting
  const ws = XLSX.utils.json_to_sheet(exportData);

  // Set column widths based on content
  const columnWidths: { [key: string]: number } = {};
  const maxWidth = 50; // Maximum column width in Excel
  
  // Calculate max width for each column (in characters)
  exportData.forEach((row: any) => {
    selectedColumns.forEach((colId) => {
      const value = row[colId];
      if (value !== undefined && value !== null) {
        const strValue = String(value);
        const length = Math.min(strValue.length, 100); // Cap at 100 chars for width calculation
        if (!columnWidths[colId] || length > columnWidths[colId]) {
          columnWidths[colId] = length;
        }
      }
    });
  });

  // Set column widths (min 10, max 50)
  const wscols = selectedColumns.map((colId) => ({
    wch: Math.min(Math.max(columnWidths[colId] || 10, 10), maxWidth)
  }));
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  // Generate filename
  let fileName = "";
  if (exportMode === "all") {
    fileName = `${title.toLowerCase().replace(/\s+/g, "-")}-all-pages.xlsx`;
  } else if (exportMode === "datewise") {
    const dateRangeStr =
      datewiseRange.from && datewiseRange.to
        ? `${datewiseRange.from}-to-${datewiseRange.to}`
        : "date-range";
    fileName = `${title.toLowerCase().replace(/\s+/g, "-")}-${dateRangeStr}.xlsx`;
  } else {
    fileName = `${title.toLowerCase().replace(/\s+/g, "-")}-current-page.xlsx`;
  }

  try {
    // Try to export with current data
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), fileName);
    setExportModal(false);
  } catch (error) {
    // If there's still an error, try with more aggressive truncation
    console.warn("Cell still exceeds Excel limit, retrying with more aggressive truncation");
    
    // Re-format data with more aggressive truncation
    const truncatedExportData = filteredExportData.map((item) => {
      const filteredItem: any = {};
      selectedColumns.forEach((colId) => {
        const value = (item as any)[colId];
        
        let formattedValue: any;
        
        if (value instanceof Timestamp) {
          formattedValue = value.toDate().toISOString();
        } else if (value instanceof Date) {
          formattedValue = value.toISOString();
        } else if (value && typeof value === 'object') {
          try {
            formattedValue = JSON.stringify(value);
          } catch {
            formattedValue = String(value);
          }
        } else {
          formattedValue = value;
        }

        // More aggressive truncation: limit to 1000 characters for safety
        if (typeof formattedValue === 'string' && formattedValue.length > 1000) {
          formattedValue = formattedValue.substring(0, 1000) + '... (truncated)';
        }

        filteredItem[colId] = formattedValue;
      });
      return filteredItem;
    });

    // Try again with truncated data
    const ws2 = XLSX.utils.json_to_sheet(truncatedExportData);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws2, "Sheet1");
    
    const buf2 = XLSX.write(wb2, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf2]), fileName);
    setExportModal(false);
  }
};

  const handleDelete = async (itemToDelete: T | null) => {
    if (!itemToDelete || !itemToDelete.id) {
      console.error("handleDelete called with invalid item.", itemToDelete);
      setConfirmDelete(null);
      return;
    }

    if (onDelete) {
      await onDelete(itemToDelete);
    } else {
      if (!collectionPath) {
        console.warn("Delete skipped: no collectionPath provided");
        setConfirmDelete(null);
        return;
      }
      await remove(itemToDelete.id);
    }
    setConfirmDelete(null);
  };

  const updateExportFilter = (columnId: string, updates: Partial<ExportFilter>) => {
    setExportFilters((prev) => {
      const newFilters = {
        ...prev,
        [columnId]: {
          ...prev[columnId],
          ...updates,
        },
      };

      if (updates.search !== undefined && newFilters[columnId]?.type === "string") {
        setFilteredValues((prevValues) => ({
          ...prevValues,
          [columnId]: filterUniqueValues(columnId, updates.search || ""),
        }));
      }

      return newFilters;
    });
  };

  const toggleExportColumn = (columnId: string) => {
    setExportColumns((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  };

  const selectAllExportColumns = (selected: boolean) => {
    const newSelection: Record<string, boolean> = {};
    Object.keys(exportColumns).forEach((colId) => {
      newSelection[colId] = selected;
    });
    setExportColumns(newSelection);
  };

  const toggleDropdown = (columnId: string) => {
    setShowDropdown((prev) => (prev === columnId ? null : columnId));
  };

  const selectUniqueValue = (columnId: string, value: string) => {
    setExportFilters((prev) => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        search: value,
      },
    }));
    setFilteredValues((prev) => ({
      ...prev,
      [columnId]: filterUniqueValues(columnId, value),
    }));
    setShowDropdown(null);
  };

  const handleSearchChange = (columnId: string, value: string) => {
    updateExportFilter(columnId, { search: value });

    if (!showDropdown) {
      setShowDropdown(columnId);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(null);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  useEffect(() => {
    if (exportModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [exportModal]);

  const clearAllFilters = () => {
    setExportFilters((prev) => {
      const newFilters = { ...prev };
      Object.keys(newFilters).forEach((key) => {
        newFilters[key] = {
          ...newFilters[key],
          enabled: false,
          search: "",
          min: "",
          max: "",
        };
      });
      return newFilters;
    });
    setFilteredValues((prev) => {
      const newFiltered = { ...prev };
      Object.keys(newFiltered).forEach((key) => {
        newFiltered[key] = exportFilters[key]?.uniqueValues || [];
      });
      return newFiltered;
    });
  };

  const totalSelectedColumns = Object.values(exportColumns).filter(Boolean).length;
  const allColumnsCount = Object.keys(exportColumns).length;

  return (
    <div className="w-full">
      <div className={`px-4 py-2 text-white font-bold text-sm flex items-center justify-between border-b border-white/10 ${headerBgColor || "bg-slate-900"}`}>
        <div className="flex items-center gap-2">
          <span>{title}</span>
        </div>
        {sumColumn && (
          <div className="flex items-center gap-3">
            {filteredTotal !== undefined && filteredTotal !== null && (
              <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-semibold">
                {filteredTotalLabel}: {typeof filteredTotal === 'number' ? filteredTotal.toFixed(2) : filteredTotal}
              </div>
            )}
             {totalSum !== null && (
              <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
                {sumLabel} (Page): {typeof totalSum === 'number' ? totalSum.toFixed(2) : totalSum}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          {!hideImportExport && (
            <>
              <label
                className="p-2 bg-white/20 rounded hover:bg-white/30 cursor-pointer"
                title="Import"
              >
                <Upload size={20} />
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleImport(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                onClick={() => setExportModal(true)}
                className="p-2 bg-white/20 rounded hover:bg-white/30 cursor-pointer"
                title="Export"
              >
                <Download size={20} />
              </button>
            </>
          )}
          {extraToolbar && <div>{extraToolbar}</div>}
          <button
            onClick={() => setShowColumnsModal(true)}
            className="p-2 bg-white/20 rounded hover:bg-white/30 cursor-pointer"
            title="Toggle Columns"
          >
            <LayoutGrid size={20} />
          </button>
          {!hideAdd && (
            <button
              onClick={onAdd}
              className="p-2 bg-white/20 rounded hover:bg-white/30 cursor-pointer"
              title="Add"
            >
              <Plus size={20} />
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="p-2 bg-white/20 rounded hover:bg-white/30 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={() => setSearchVisible((s) => !s)}
            className="p-2 bg-white/20 rounded hover:bg-white/30 cursor-pointer"
            title="Search"
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      <div className="border-x border-b overflow-auto">
        <table className="min-w-full table-fixed">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-gray-100">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="p-3 text-left font-semibold border-r">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
            {searchVisible && (
              <tr className="bg-gray-50">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const key = header.column.id;
                  const canSearch = key !== "sr" && key !== "actions";
                  const isDateColumn = columnTypes[key] === 'date';

                  return (
                    <th key={key} className="p-2 border-r relative">
                      {canSearch && (
                        <div className="relative">
                          {isDateColumn ? (
                            <div className="flex gap-1 items-center">
                              <input
                                type="date"
                                value={disableInternalFiltering ? dateRangeValues[key]?.from || '' : dateRangeFilters[key]?.from || ''}
                                onChange={(e) => {
                                  const newRange = { from: e.target.value, to: (disableInternalFiltering ? dateRangeValues[key]?.to : dateRangeFilters[key]?.to) || '' };
                                  if (disableInternalFiltering && onDateRangeChange) {
                                    onDateRangeChange(key, newRange);
                                  } else {
                                    setDateRangeFilters(prev => ({ ...prev, [key]: { ...prev[key], from: e.target.value } }));
                                  }
                                }}
                                className="w-full p-1 border rounded text-sm"
                                placeholder="From"
                              />
                              <span className="text-gray-400">–</span>
                              <input
                                type="date"
                                value={disableInternalFiltering ? dateRangeValues[key]?.to || '' : dateRangeFilters[key]?.to || ''}
                                onChange={(e) => {
                                  const newRange = { from: (disableInternalFiltering ? dateRangeValues[key]?.from : dateRangeFilters[key]?.from) || '', to: e.target.value };
                                  if (disableInternalFiltering && onDateRangeChange) {
                                    onDateRangeChange(key, newRange);
                                  } else {
                                    setDateRangeFilters(prev => ({ ...prev, [key]: { ...prev[key], to: e.target.value } }));
                                  }
                                }}
                                className="w-full p-1 border rounded text-sm"
                                placeholder="To"
                              />
                              {((disableInternalFiltering ? dateRangeValues[key]?.from : dateRangeFilters[key]?.from) ||
                                (disableInternalFiltering ? dateRangeValues[key]?.to : dateRangeFilters[key]?.to)) && (
                                  <button
                                    onClick={() => {
                                      if (disableInternalFiltering && onDateRangeChange) {
                                        onDateRangeChange(key, { from: '', to: '' });
                                      } else {
                                        setDateRangeFilters(prev => {
                                          const newFilters = { ...prev };
                                          delete newFilters[key];
                                          return newFilters;
                                        });
                                      }
                                    }}
                                    className="text-gray-400 hover:text-red-500 ml-1"
                                    title="Clear range"
                                  >
                                    <X size={16} />
                                  </button>
                                )}
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                value={disableInternalFiltering ? columnSearchValues[key] || "" : columnSearch[key] || ""}
                                onChange={(e) => {
                                  if (disableInternalFiltering && onColumnSearchChange) {
                                    onColumnSearchChange(key, e.target.value);
                                  } else {
                                    setColumnSearch((s) => ({ ...s, [key]: e.target.value }));
                                  }
                                }}
                                onFocus={() => setSearchDropdown(key)}
                                className="w-full p-1 border rounded pr-16"
                                placeholder={`Search ${String(header.column.columnDef.header ?? key)}`}
                              />
                              {(disableInternalFiltering ? columnSearchValues[key] : columnSearch[key]) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (disableInternalFiltering && onColumnSearchChange) {
                                      onColumnSearchChange(key, "");
                                    } else {
                                      setColumnSearch((s) => ({ ...s, [key]: "" }));
                                    }
                                  }}
                                  className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  <X size={16} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSearchDropdown(searchDropdown === key ? null : key)}
                                className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              >
                                <ChevronDown size={16} />
                              </button>

                              {searchDropdown === key && (
                                <div
                                  ref={searchDropdownRef}
                                  className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                                >
                                  <div className="p-2 border-b bg-gray-50 text-xs text-gray-500">
                                    {(() => {
                                      let allUnique: string[] = [];
                                      if (disableInternalFiltering) {
                                        allUnique = columnUniqueValues[key] || [];
                                      } else {
                                        allUnique = getUniqueValues(key);
                                      }
                                      const currentSearch = disableInternalFiltering ? columnSearchValues[key] || "" : columnSearch[key] || "";
                                      const filtered = currentSearch
                                        ? allUnique.filter(v => v.toLowerCase().startsWith(currentSearch.toLowerCase()))
                                        : allUnique;
                                      return filtered.length;
                                    })} matching values
                                  </div>
                                  {(() => {
                                    let allUnique: string[] = [];
                                    if (disableInternalFiltering) {
                                      allUnique = columnUniqueValues[key] || [];
                                    } else {
                                      allUnique = getUniqueValues(key);
                                    }
                                    const currentSearch = disableInternalFiltering ? columnSearchValues[key] || "" : columnSearch[key] || "";
                                    const filtered = currentSearch
                                      ? allUnique.filter(v => v.toLowerCase().startsWith(currentSearch.toLowerCase()))
                                      : allUnique;
                                    return filtered.map((value, idx) => (
                                      <div
                                        key={idx}
                                        className={`px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between ${
                                          (disableInternalFiltering ? columnSearchValues[key] : columnSearch[key]) === value ? "bg-blue-100" : ""
                                        }`}
                                        onClick={() => {
                                          if (disableInternalFiltering && onColumnSearchChange) {
                                            onColumnSearchChange(key, value);
                                          } else {
                                            setColumnSearch((s) => ({ ...s, [key]: value }));
                                          }
                                          setSearchDropdown(null);
                                        }}
                                      >
                                        <span className="truncate">{value}</span>
                                        {(disableInternalFiltering ? columnSearchValues[key] : columnSearch[key]) === value && (
                                          <Check size={16} className="text-blue-600" />
                                        )}
                                      </div>
                                    ));
                                  })()}
                                  {(() => {
                                    let allUnique: string[] = [];
                                    if (disableInternalFiltering) {
                                      allUnique = columnUniqueValues[key] || [];
                                    } else {
                                      allUnique = getUniqueValues(key);
                                    }
                                    const currentSearch = disableInternalFiltering ? columnSearchValues[key] || "" : columnSearch[key] || "";
                                    const filtered = currentSearch
                                      ? allUnique.filter(v => v.toLowerCase().startsWith(currentSearch.toLowerCase()))
                                      : allUnique;
                                    return filtered.length === 0 && (
                                      <div className="px-3 py-3 text-gray-500 text-sm text-center">
                                        No matching values
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-white/50">
                {row.getVisibleCells().map((cell) => {
                  const rawValue = cell.getValue();
                  let displayValue: string = "";

                  if (rawValue instanceof Timestamp) {
                    displayValue = rawValue.toDate().toLocaleString();
                  } else if (rawValue != null) {
                    displayValue = formatValue(rawValue);
                  }

                  return (
                    <td key={cell.id} className="p-1 align-top border-r">
                      {cell.column.columnDef.cell
                        ? flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )
                        : displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end p-4">
        <div className="text-sm text-gray-600">
          View {filteredData.length ? `1 - ${filteredData.length} of ${rows.length}` : "0 - 0 of 0"}
          {totalRecords && totalRecords > rows.length && (
            <span className="ml-2 text-gray-400">
              (Total: {totalRecords})
            </span>
          )}
        </div>
      </div>

      {/* Export Modal */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Export Data</h2>
              <button
                onClick={() => setExportModal(false)}
                className="text-gray-500 hover:text-red-500"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {/* Export Mode Selection */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Export Mode
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setExportMode("current")}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      exportMode === "current"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <FileSpreadsheet className="mx-auto mb-2" size={24} />
                    <div className="font-semibold">Current Page</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Export only visible page ({rows.length} records)
                    </div>
                  </button>

                  <button
                    onClick={() => setExportMode("all")}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      exportMode === "all"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Download className="mx-auto mb-2" size={24} />
                    <div className="font-semibold">All Pages</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {onExportAllPages 
                        ? `Export all ${totalRecords || 'available'} records`
                        : "⚠️ Export callback not configured"}
                    </div>
                  </button>

                  <button
                    onClick={() => setExportMode("datewise")}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      exportMode === "datewise"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Calendar className="mx-auto mb-2" size={24} />
                    <div className="font-semibold">Date Range (Single Sheet)</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Export all records within a date range as one sheet
                    </div>
                  </button>
                </div>
              </div>

              {/* Date Range Configuration (only for datewise mode) */}
              {exportMode === "datewise" && (
                <div className="mb-8 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-semibold text-purple-800 mb-3">
                    Date Range Filter
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={datewiseRange.from}
                        onChange={(e) =>
                          setDatewiseRange((prev) => ({
                            ...prev,
                            from: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={datewiseRange.to}
                        onChange={(e) =>
                          setDatewiseRange((prev) => ({
                            ...prev,
                            to: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-purple-700">
                    <p>• All records within the selected date range will be exported in a single sheet</p>
                    <p>• You can also apply column filters below</p>
                  </div>
                </div>
              )}

              {/* Column Selection Section */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">
                    Select Columns to Export
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {totalSelectedColumns} of {allColumnsCount} selected
                    </span>
                    <button
                      onClick={() => selectAllExportColumns(true)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => selectAllExportColumns(false)}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {columns
                    .filter((col) => {
                      const colId = (col.id ?? (col as any).accessorKey) as string;
                      return colId && colId !== "sr" && colId !== "actions";
                    })
                    .map((col) => {
                      const colId = (col.id ?? (col as any).accessorKey) as string;
                      const filter = exportFilters[colId];

                      return (
                        <div
                          key={colId}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${
                            exportColumns[colId]
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          onClick={() => toggleExportColumn(colId)}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                exportColumns[colId]
                                  ? "bg-blue-500 border-blue-500"
                                  : "border-gray-300"
                              }`}
                            >
                              {exportColumns[colId] && (
                                <span className="text-white text-xs">✓</span>
                              )}
                            </div>
                            <span className="font-medium text-gray-700">
                              {col.header as string || colId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {filter?.enabled && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                Filter Active
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Filters Section */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">
                    Apply Filters
                  </h3>
                  <button
                    onClick={clearAllFilters}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Clear All Filters
                  </button>
                </div>
                <div className="space-y-6">
                  {columns
                    .filter((col) => {
                      const colId = (col.id ?? (col as any).accessorKey) as string;
                      return colId && colId !== "sr" && colId !== "actions";
                    })
                    .map((col) => {
                      const colId = (col.id ?? (col as any).accessorKey) as string;
                      const filter = exportFilters[colId];

                      if (!filter) return null;

                      return (
                        <div key={colId} className="border rounded-lg p-4 bg-gray-50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <label className="inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filter.enabled}
                                  onChange={(e) =>
                                    updateExportFilter(colId, {
                                      enabled: e.target.checked,
                                    })
                                  }
                                  className="sr-only peer"
                                />
                                <div
                                  className={`relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer ${
                                    filter.enabled ? "peer-checked:bg-blue-600" : ""
                                  }`}
                                >
                                  <div
                                    className={`absolute top-0.5 left-0.5 bg-white border rounded-full h-5 w-5 transition-all ${
                                      filter.enabled
                                        ? "transform translate-x-full border-blue-600"
                                        : "border-gray-300"
                                    }`}
                                  ></div>
                                </div>
                              </label>
                              <span className="font-medium text-gray-700">
                                {col.header as string || colId}
                              </span>
                            </div>
                          </div>

                          {filter.enabled && (
                            <div className="mt-3 space-y-3">
                              {filter.type === "string" && (
                                <div className="relative">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Select or search text
                                  </label>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={filter.search || ""}
                                      onChange={(e) =>
                                        handleSearchChange(colId, e.target.value)
                                      }
                                      onClick={() => toggleDropdown(colId)}
                                      placeholder={`Search in ${col.header || colId}`}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => toggleDropdown(colId)}
                                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                      <ChevronDown size={20} />
                                    </button>
                                  </div>

                                  {showDropdown === colId && filter.uniqueValues && (
                                    <div
                                      ref={dropdownRef}
                                      className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                                    >
                                      <div className="p-2 border-b bg-gray-50">
                                        <div className="text-xs text-gray-500 flex justify-between">
                                          <span>
                                            {filteredValues[colId]?.length || 0}{" "}
                                            matching values
                                          </span>
                                          <span>
                                            {filter.search
                                              ? `Filtered by: "${filter.search}"`
                                              : "All values"}
                                          </span>
                                        </div>
                                      </div>
                                      {filteredValues[colId] &&
                                        filteredValues[colId].length > 0 ? (
                                        filteredValues[colId].map((value, index) => (
                                          <div
                                            key={index}
                                            className={`px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between ${
                                              filter.search === value
                                                ? "bg-blue-100"
                                                : ""
                                            }`}
                                            onClick={() =>
                                              selectUniqueValue(colId, value)
                                            }
                                          >
                                            <span className="truncate">{value}</span>
                                            {filter.search === value && (
                                              <Check
                                                size={16}
                                                className="text-blue-600"
                                              />
                                            )}
                                          </div>
                                        ))
                                      ) : (
                                        <div className="px-3 py-3 text-gray-500 text-sm text-center">
                                          {filter.search ? (
                                            <div>
                                              No values start with "
                                              <span className="font-semibold">
                                                {filter.search}
                                              </span>
                                              "
                                            </div>
                                          ) : (
                                            <div>No values available</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {filter.uniqueValues &&
                                    filter.uniqueValues.length > 0 && (
                                      <div className="mt-2 text-xs text-gray-500 flex justify-between">
                                        <span>
                                          {filter.search
                                            ? `Showing ${filteredValues[colId]?.length || 0
                                            } values starting with "${filter.search}"`
                                            : `Found ${filter.uniqueValues.length
                                            } unique values. Start typing to filter.`}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (filter.search) {
                                              updateExportFilter(colId, {
                                                search: "",
                                              });
                                            }
                                          }}
                                          className="text-blue-600 hover:text-blue-800"
                                        >
                                          {filter.search ? "Clear filter" : ""}
                                        </button>
                                      </div>
                                    )}
                                </div>
                              )}

                              {filter.type === "number" && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Minimum
                                    </label>
                                    <input
                                      type="number"
                                      value={filter.min || ""}
                                      onChange={(e) =>
                                        updateExportFilter(colId, {
                                          min: e.target.value,
                                        })
                                      }
                                      placeholder="Min value"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Maximum
                                    </label>
                                    <input
                                      type="number"
                                      value={filter.max || ""}
                                      onChange={(e) =>
                                        updateExportFilter(colId, {
                                          max: e.target.value,
                                        })
                                      }
                                      placeholder="Max value"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                              )}

                              {filter.type === "date" && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      From Date
                                    </label>
                                    <input
                                      type="date"
                                      value={filter.min || ""}
                                      onChange={(e) =>
                                        updateExportFilter(colId, {
                                          min: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      To Date
                                    </label>
                                    <input
                                      type="date"
                                      value={filter.max || ""}
                                      onChange={(e) =>
                                        updateExportFilter(colId, {
                                          max: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                              )}

                              {filter.type === "boolean" && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Filter by value
                                  </label>
                                  <select
                                    value={filter.search || ""}
                                    onChange={(e) =>
                                      updateExportFilter(colId, {
                                        search: e.target.value,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">All values</option>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Summary Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-blue-800 mb-2">
                  Export Summary
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-blue-600">Export Mode</p>
                    <p className="text-xl font-bold text-blue-800 capitalize">
                      {exportMode === "current" && "Current Page"}
                      {exportMode === "all" && "All Pages"}
                      {exportMode === "datewise" && "Date Range"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600">
                      {exportMode === "all" ? "Total Records" : "Records Available"}
                    </p>
                    <p className="text-xl font-bold text-blue-800">
                      {exportMode === "all" && totalRecords 
                        ? totalRecords 
                        : exportMode === "all" 
                          ? rows.length
                          : rows.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600">Selected Columns</p>
                    <p className="text-xl font-bold text-blue-800">
                      {totalSelectedColumns}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600">Active Filters</p>
                    <p className="text-xl font-bold text-blue-800">
                      {Object.values(exportFilters).filter((f) => f.enabled).length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => setExportModal(false)}
                  className="px-6 py-2.5 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={totalSelectedColumns === 0 || isExportingAll}
                  className={`px-6 py-2.5 font-medium rounded-lg transition-colors flex items-center gap-2 ${
                    totalSelectedColumns === 0 || isExportingAll
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-green-500 text-white hover:bg-green-600 cursor-pointer"
                  }`}
                >
                  {isExportingAll ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Fetching all records...
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      {exportMode === "current" && `Export ${rows.length} Records`}
                      {exportMode === "all" && `Export All Records`}
                      {exportMode === "datewise" && `Export Date Range`}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showColumnsModal && (
        <ColumnToggle
          title={`Customize Column Visibility: ${title}`}
          columns={columns
            .map((c) => {
              const id = (c.id ?? (c as any).accessorKey) as string | undefined;
              if (!id) return null;
              return {
                id,
                label: ((c as any).header as string) ?? id,
                visible: !!visibleCols[id],
              };
            })
            .filter(Boolean) as Array<{
              id: string;
              label: string;
              visible: boolean;
            }>}
          onToggle={toggleCol}
          onClose={() => setShowColumnsModal(false)}
          defaultVisibleIds={defaultVisibleColumnIds}
        />
      )}

      {viewData && (
        <div 
          onClick={() => setViewData(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden border border-gray-100 flex flex-col animate-fade-in my-6 overscroll-contain"
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-slate-50/70 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                Record Details
              </h2>
              <button
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 transition cursor-pointer"
                onClick={() => setViewData(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div 
              onWheel={(e) => e.stopPropagation()}
              className="overflow-y-auto p-4 space-y-2 flex-1 overscroll-contain"
            >
              {(viewColumns || columns).map((col) => {
                const key = col.id ?? (col as any).accessorKey;

                if (key === "actions" || key === "sr") return null;

                let displayValue: React.ReactNode;

                const rawVal = viewData[key];

                // If this is materials or contains JSON list of products with productName and quantity
                const isMaterials =
                  key === "materials" ||
                  (typeof rawVal === "string" &&
                    (rawVal.includes("productName") || rawVal.includes('"productId"')) &&
                    rawVal.includes("quantity")) ||
                  (Array.isArray(rawVal) && rawVal.length > 0 && (rawVal[0]?.productName || rawVal[0]?.productId));

                if (isMaterials) {
                  try {
                    let mats = rawVal;
                    if (typeof mats === "string") mats = JSON.parse(mats);
                    if (Array.isArray(mats) && mats.length > 0) {
                      displayValue = (
                        <div className="flex flex-col gap-1.5 items-end">
                          {mats.map((m: any, mIdx: number) => (
                            <div key={mIdx} className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/80">
                              <span className="font-semibold text-gray-800 text-xs">
                                {m.productName || m.name || m.productId || "Item"}
                              </span>
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-bold border border-blue-200 font-mono">
                                Qty: {m.quantity ?? m.qty ?? 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    } else {
                      displayValue = <span className="text-gray-400 text-xs">-</span>;
                    }
                  } catch {
                    displayValue = String(rawVal);
                  }
                } else if (typeof col.cell === "function") {
                  displayValue = flexRender(col.cell, {
                    row: { original: viewData },
                    // @ts-ignore
                    getValue: () => viewData[key],
                  });
                } else {
                  displayValue = formatValue(viewData[key]);
                }

                return (
                  <div
                    key={key}
                    className="flex justify-between items-start px-4 py-3 rounded-2xl bg-slate-50/70 border border-slate-100"
                  >
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {col.header as string}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 max-w-[65%] text-right break-words">
                      {displayValue}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-slate-50/70 flex justify-end flex-shrink-0">
              <button
                onClick={() => setViewData(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80">
            <h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
            <p className="mb-4">Are you sure you want to delete this record?</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition cursor-pointer"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition cursor-pointer"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}