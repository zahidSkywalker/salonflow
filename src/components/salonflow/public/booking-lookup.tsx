"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, prettyDate, money } from "../shared";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CalendarDays, Clock, User } from "lucide-react";

interface BookingDetails {
  ref: string;
  date: string;
  startMin: number;
  endMin: number;
  status: string;
  customer: { name: string; phone: string };
  staff: { name: string; title: string };
  service: { name: string; price: number; durationMin: number; category: string };
}

export default function BookingLookup({
  open, onOpenChange, currencySymbol,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currencySymbol: string;
}) {
  const [ref, setRef] = useState("");
  const [submitted, setSubmitted] = useState("");
  const queryClient = useQueryClient();

  const { data, isFetching, error } = useQuery<BookingDetails>({
    queryKey: ["booking", submitted],
    queryFn: async () => {
      const res = await fetch(`/api/public/bookings/${encodeURIComponent(submitted)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Not found");
      return body;
    },
    enabled: !!submitted && open,
    retry: false,
  });

  const cancel = async () => {
    if (!data) return;
    await fetch(`/api/public/bookings/${data.ref}`, { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["booking", submitted] });
  };

  const close = (v: boolean) => {
    if (!v) { setRef(""); setSubmitted(""); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Find my booking</DialogTitle>
          <DialogDescription>Enter the reference code from your confirmation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setSubmitted(ref.trim().toUpperCase()); }}
          >
            <Input
              value={ref}
              onChange={(e) => setRef(e.target.value.toUpperCase())}
              placeholder="SA-XXXXX"
              className="font-mono tracking-widest"
            />
            <Button type="submit" disabled={ref.trim().length < 4 || isFetching}>
              {isFetching ? "…" : "Find"}
            </Button>
          </form>

          {error && (
            <p className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2.5">
              {(error as Error).message}
            </p>
          )}

          {data && (
            <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold tracking-widest text-lg">{data.ref}</span>
                <StatusBadge status={data.status} />
              </div>
              <div className="text-sm space-y-1.5">
                <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" />{prettyDate(data.date)}</p>
                <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" />{String(Math.floor(data.startMin / 60)).padStart(2, "0")}:{String(data.startMin % 60).padStart(2, "0")} · {data.service.name}</p>
                <p className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" />{data.staff.name} · {money(data.service.price, currencySymbol)}</p>
              </div>
              {(data.status === "CONFIRMED" || data.status === "PENDING") && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive hover:text-destructive">
                      Cancel this booking
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel booking {data.ref}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your slot on {prettyDate(data.date)} will be released to other guests. This can&apos;t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction onClick={cancel} className="bg-destructive text-white hover:bg-destructive/90">
                        Yes, cancel it
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
