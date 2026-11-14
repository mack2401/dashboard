import React, { useState, useEffect } from "react";

interface ColumnToggleProps {
  /** Array of columns with id, label, and current visibility */
  columns: { id: string; label: string; visible: boolean }[];
  /** Callback when a checkbox is toggled */
  onToggle: (id: string) => void;
  /** Callback to close the modal */
  onClose?: () => void;
  /** Modal title */
  title?: string;
  /** Optional list of column IDs that should be visible when "Reset to Default" is clicked.
   *  If not provided, resets to the state when the modal first opened.
   */
  defaultVisibleIds?: string[];
}

export default function ColumnToggle({
  columns,
  onToggle,
  onClose,
  title = "Customize Column Visibility",
  defaultVisibleIds,
}: ColumnToggleProps) {
  // Capture the initial visibility state when the modal opens (used as fallback)
  const [initialVisible, setInitialVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    columns.forEach((col) => {
      initial[col.id] = col.visible;
    });
    setInitialVisible(initial);
  }, []); // Run only once on mount

  const allVisible = columns.every((col) => col.visible);
  const someVisible = columns.some((col) => col.visible);

  const handleSelectAll = () => {
    const targetState = !allVisible;
    columns.forEach((col) => {
      if (col.visible !== targetState) {
        onToggle(col.id);
      }
    });
  };

  const handleDeselectAll = () => {
    columns.forEach((col) => {
      if (col.visible) {
        onToggle(col.id);
      }
    });
  };

  const handleResetDefault = () => {
    columns.forEach((col) => {
      // Determine target visibility: use defaultVisibleIds if provided, otherwise fallback to initialVisible
      const targetVisible = defaultVisibleIds
        ? defaultVisibleIds.includes(col.id)
        : initialVisible[col.id];
      if (col.visible !== targetVisible) {
        onToggle(col.id);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose} // Clicking overlay closes modal
    >
      <div
        className="bg-white w-full max-w-md rounded-xl shadow-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        {/* Modal Header */}
        <div className="bg-purple-500 px-4 py-3 text-white text-lg font-semibold rounded-t-xl">
          {title}
        </div>

        {/* Table Header with Select All checkbox */}
        <div className="px-4 py-2 border-b bg-white sticky top-0 z-10">
          <div className="grid grid-cols-2 text-sm font-semibold">
            <span>Column</span>
            <div className="flex items-center gap-2">
              <span>Show</span>
              <input
                type="checkbox"
                ref={(input) => {
                  if (input) {
                    input.indeterminate = someVisible && !allVisible;
                  }
                }}
                checked={allVisible}
                onChange={handleSelectAll}
                className="w-4 h-4 cursor-pointer accent-purple-500"
                title="Select All"
              />
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {columns.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-2 items-center border-b py-2 hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium">{c.label}</span>
              <input
                type="checkbox"
                checked={c.visible}
                onChange={() => onToggle(c.id)}
                className="w-5 h-5 cursor-pointer accent-purple-500 justify-self-start"
              />
            </div>
          ))}
        </div>

        {/* Footer with action buttons – colored */}
        <div className="px-4 py-3 border-t bg-white flex justify-end gap-2">
          <button
            onClick={handleDeselectAll}
            className="px-4 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
          >
            Deselect All
          </button>
          <button
            onClick={handleResetDefault}
            className="px-4 py-2 border border-blue-500 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white transition-colors cursor-pointer"
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}