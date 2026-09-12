"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { translate } from "@/i18n/runtime";

const PLACEHOLDER = `eyJhbGciOiJIUzUxMiIs...
eyJhbGciOiJIUzUxMiIs...
eyJhbGciOiJIUzUxMiIs...`;

/**
 * Bulk-import raw offline JWT tokens (one per line) as API-key connections.
 * Names auto-follow the DD-MM-YYYY-N pattern; expiresAt decodes from the JWT
 * exp claim. Duplicates already stored on this provider are skipped.
 */
export default function BulkImportJwtModal({ providerId, isOpen, onClose, onSuccess }) {
  const [tokenText, setTokenText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState(null);

  const handleClose = () => {
    if (submitting) return;
    setTokenText("");
    setParseError("");
    setResult(null);
    onClose();
  };

  const handleSubmit = async () => {
    setParseError("");
    setResult(null);
    const trimmed = tokenText.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/oauth/${providerId}/bulk-jwt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data?.error || `Request failed: ${res.status}`);
        return;
      }
      setResult(data);
      if (data.success > 0 && typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setParseError(err.message || translate("Request failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const failedItems = result?.results?.filter((r) => !r.ok) || [];
  const skipped = result?.skipped || 0;

  return (
    <Modal isOpen={isOpen} title={translate("Bulk Add JWT Tokens")} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted">
          {translate(
            "Paste one JWT token per line. Each becomes a connection named DD-MM-YYYY-N; expiry is read from the token. Duplicates are skipped."
          )}
        </p>

        <textarea
          className="w-full rounded border border-accent/30 bg-sidebar p-2 text-xs font-mono resize-y min-h-[240px] focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={PLACEHOLDER}
          value={tokenText}
          onChange={(e) => setTokenText(e.target.value)}
          disabled={submitting}
          spellCheck={false}
        />

        {parseError && (
          <p className="text-xs text-red-500 break-words">{parseError}</p>
        )}

        {result && (
          <div className="flex flex-col gap-2">
            <div
              className={`text-sm font-medium ${
                result.failed > 0 ? "text-yellow-400" : "text-green-400"
              }`}
            >
              ✓ {result.success} {translate("added")}
              {skipped > 0 ? `, ⊘ ${skipped} ${translate("skipped (duplicate)")}` : ""}
              {result.failed > 0 ? `, ✗ ${result.failed} ${translate("failed")}` : ""}
            </div>
            {failedItems.length > 0 && (
              <ul className="rounded border border-accent/20 bg-sidebar/50 p-2 text-xs font-mono max-h-40 overflow-y-auto">
                {failedItems.map((item) => (
                  <li key={item.index} className="text-red-400">
                    [{item.index}] {item.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={submitting || !tokenText.trim()}
          >
            {submitting ? translate("Importing...") : translate("Import All")}
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth disabled={submitting}>
            {translate("Close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

BulkImportJwtModal.propTypes = {
  providerId: PropTypes.string.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};
