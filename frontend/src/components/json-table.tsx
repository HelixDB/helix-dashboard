"use client"

import { useMemo, useState } from "react"
import {
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    ColumnDef,
    SortingState,
    FilterFn,
} from "@tanstack/react-table"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search } from "lucide-react"

interface JsonTableProps {
    data: string
}

const globalFilterFn: FilterFn<any> = (row, _columnId, value) => {
    const search = value.toLowerCase()
    const rowData = row.original

    const searchInObject = (obj: any): boolean => {
        if (obj === null || obj === undefined) return false

        if (typeof obj === 'string') {
            return obj.toLowerCase().includes(search)
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return String(obj).toLowerCase().includes(search)
        }

        if (Array.isArray(obj)) {
            return obj.some(item => searchInObject(item))
        }

        if (typeof obj === 'object') {
            return Object.values(obj).some(val => searchInObject(val))
        }

        return false
    }

    return searchInObject(rowData)
}

export function JsonTable({ data }: JsonTableProps) {
    const [sorting, setSorting] = useState<SortingState>([])
    const [globalFilter, setGlobalFilter] = useState("")

    const { parsedData, columns } = useMemo(() => {
        try {
            const parsed = JSON.parse(data)
            let tableData: any[] = []

            if (Array.isArray(parsed)) {
                tableData = parsed
            } else if (parsed && typeof parsed === 'object') {
                const arrayKeys = Object.keys(parsed).filter(key => Array.isArray(parsed[key]))

                if (arrayKeys.length === 1) {
                    tableData = parsed[arrayKeys[0]]
                } else if (arrayKeys.length > 1) {
                    tableData = parsed[arrayKeys[0]]
                } else {
                    tableData = [parsed]
                }
            }

            if (!Array.isArray(tableData) || tableData.length === 0) {
                return { parsedData: [], columns: [] }
            }

            const firstItem = tableData[0]
            const keys = Object.keys(firstItem)

            const sortedKeys = keys.sort((a, b) => {
                if (a.toLowerCase() === 'id') return -1
                if (b.toLowerCase() === 'id') return 1
                return 0
            })

            const cols: ColumnDef<any>[] = sortedKeys.map((key) => ({
                accessorKey: key,
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                            className="h-8 px-2"
                        >
                            {key}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    )
                },
                cell: ({ getValue }) => {
                    const value = getValue()

                    if (value === null) return <span className="text-muted-foreground">null</span>
                    if (value === undefined) return <span className="text-muted-foreground">-</span>

                    if (typeof value === 'boolean') {
                        return <span className={value ? "text-green-600" : "text-red-600"}>{String(value)}</span>
                    }

                    if (typeof value === 'object') {
                        return (
                            <span className="font-mono text-xs">{JSON.stringify(value)}</span>
                        )
                    }

                    return <span>{String(value)}</span>
                },
            }))

            return { parsedData: tableData, columns: cols }
        } catch (e) {
            console.error("Failed to parse JSON for table:", e)
            return { parsedData: [], columns: [] }
        }
    }, [data])

    const table = useReactTable({
        data: parsedData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        globalFilterFn,
        state: {
            sorting,
            globalFilter,
        },
        initialState: {
            pagination: {
                pageSize: 50, // Increased default page size
            },
        },
    })

    if (parsedData.length === 0 || columns.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No tabular data found in response
            </div>
        )
    }

    return (
        <div className="w-full max-w-full overflow-hidden space-y-4">
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search all columns..."
                        value={globalFilter ?? ""}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {table.getFilteredRowModel().rows.length} of {parsedData.length} rows
                </div>
            </div>

            <div className="relative w-full overflow-hidden rounded-md border">
                <div className="overflow-auto hide-scrollbar max-h-[400px] [&_[data-slot='table-container']]:overflow-visible">
                    <Table className="w-max">
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <TableHead key={header.id} className="h-10">
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} className="py-2">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center">
                                        No results.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                        Page {table.getState().pagination.pageIndex + 1} of{" "}
                        {table.getPageCount()}
                    </div>
                    <select
                        value={table.getState().pagination.pageSize}
                        onChange={e => table.setPageSize(Number(e.target.value))}
                        className="h-8 px-2 text-sm bg-background border rounded"
                    >
                        {[10, 25, 50, 100, 200].map(pageSize => (
                            <option key={pageSize} value={pageSize}>
                                Show {pageSize}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}