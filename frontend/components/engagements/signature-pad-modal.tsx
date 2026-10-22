"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, PenTool, CheckCircle2 } from "lucide-react";

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementTitle: string;
  onSign: (data: {
    signer_name: string;
    signer_email: string;
    signer_role: "internal" | "client";
    signer_title: string;
    signature_data: string;
  }) => Promise<void>;
}

export function SignaturePadModal({
  isOpen,
  onClose,
  agreementTitle,
  onSign,
}: SignaturePadModalProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [signerName, setSignerName] = React.useState("");
  const [signerEmail, setSignerEmail] = React.useState("");
  const [signerTitle, setSignerTitle] = React.useState("Director / Sponsor");
  const [signerRole, setSignerRole] = React.useState<"internal" | "client">("internal");
  const [hasSignature, setHasSignature] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Setup canvas
  React.useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [isOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canvasRef.current || !hasSignature) return;
    const sigData = canvasRef.current.toDataURL("image/png");

    setIsSubmitting(true);
    try {
      await onSign({
        signer_name: signerName,
        signer_email: signerEmail,
        signer_role: signerRole,
        signer_title: signerTitle,
        signature_data: sigData,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Execute Digital Signature"
      description={`Legal electronic execution for: ${agreementTitle}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Signer Full Name *</Label>
            <Input
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="e.g. Niladri Banerjee"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Signer Email *</Label>
            <Input
              required
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="e.g. director@officeos.local"
              className="mt-1 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Signer Capacity / Role</Label>
            <select
              value={signerRole}
              onChange={(e) => setSignerRole(e.target.value as "internal" | "client")}
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
            >
              <option value="internal">Internal Authorized Signatory (Organization)</option>
              <option value="client">Client Authorized Signatory</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Designation / Title</Label>
            <Input
              value={signerTitle}
              onChange={(e) => setSignerTitle(e.target.value)}
              placeholder="e.g. Managing Director / VP"
              className="mt-1 text-xs"
            />
          </div>
        </div>

        {/* Canvas Signature Pad */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <PenTool className="h-3.5 w-3.5 text-primary-600" />
              <span>Draw Electronic Signature below *</span>
            </Label>
            <button
              type="button"
              onClick={clearCanvas}
              className="text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
            >
              Clear Canvas
            </button>
          </div>
          <div className="border border-slate-300 rounded-xl bg-slate-50/50 p-2 flex justify-center shadow-inner">
            <canvas
              ref={canvasRef}
              width={500}
              height={140}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="border border-slate-200/80 rounded-lg bg-white cursor-crosshair shadow-sm touch-none"
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Signature will be bound with SHA-256 cryptographic checksum, timestamp, and audit trail.
          </p>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!hasSignature || !signerName || !signerEmail || isSubmitting}
            className="flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSubmitting ? "Signing..." : "Legally Sign Document"}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
