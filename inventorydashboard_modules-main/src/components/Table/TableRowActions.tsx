import React from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";

interface Props<T> {
  row: T & { id?: string };
  onView: (row: any) => void;
  onEdit: (row: any) => void;
  onDelete: (id: string) => void;
}

export default function TableRowActions<T>({
  row,
  onView,
  onEdit,
  onDelete,
}: Props<T>) {
  return (
    <div className="flex items-center justify-center gap-1 py-1">
      {/* View Button */}
      <button
        onClick={() => onView(row)}
        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition"
        title="View Details"
      >
        <Eye className="w-4 h-4" />
      </button>

      {/* Edit Button */}
      <button
        onClick={() => onEdit(row)}
        className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg cursor-pointer transition"
        title="Edit"
      >
        <Pencil className="w-4 h-4" />
      </button>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(row.id!)}
        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition"
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
