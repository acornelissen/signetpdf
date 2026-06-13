use std::fmt;
use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Upper bound on a PDF we will load into memory. Generous for real documents,
/// but stops a multi-gigabyte file from freezing the webview.
pub const MAX_PDF_BYTES: u64 = 200 * 1024 * 1024;

/// A PDF the user opened: its absolute path (so we can later save in place) and
/// its raw bytes (handed to pdf.js on the frontend).
#[derive(Serialize)]
pub struct OpenedPdf {
    pub path: String,
    pub bytes: Vec<u8>,
}

/// Why a read failed, with a user-facing message. Corrupt-or-not-a-PDF detection
/// is left to pdf.js on the frontend (it has the full parser); this layer only
/// guards I/O and size.
#[derive(Debug)]
pub enum ReadError {
    Io(std::io::Error),
    TooLarge { size: u64, max: u64 },
}

impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReadError::Io(err) => write!(f, "Could not read the file: {err}"),
            ReadError::TooLarge { size, max } => write!(
                f,
                "That PDF is too large to open ({size} bytes; limit is {max} bytes)."
            ),
        }
    }
}

impl From<std::io::Error> for ReadError {
    fn from(err: std::io::Error) -> Self {
        ReadError::Io(err)
    }
}

/// Reject a file whose size exceeds the limit before we read it into memory.
fn ensure_within_limit(size: u64, max: u64) -> Result<(), ReadError> {
    if size > max {
        Err(ReadError::TooLarge { size, max })
    } else {
        Ok(())
    }
}

/// Read a PDF file's bytes from disk, refusing anything over the size limit.
/// Kept separate from the dialog so it can be unit-tested without any UI.
pub fn read_pdf_file(path: &Path) -> Result<Vec<u8>, ReadError> {
    let metadata = std::fs::metadata(path)?;
    ensure_within_limit(metadata.len(), MAX_PDF_BYTES)?;
    Ok(std::fs::read(path)?)
}

/// Show a native open dialog filtered to PDFs, then return the chosen file's
/// path and bytes. Returns `Ok(None)` when the user cancels; `Err` (with a
/// readable message) when the file cannot be read or is too large.
#[tauri::command]
pub async fn open_pdf(app: AppHandle) -> Result<Option<OpenedPdf>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };

    let path = picked.into_path().map_err(|e| e.to_string())?;
    let bytes = read_pdf_file(&path).map_err(|e| e.to_string())?;
    Ok(Some(OpenedPdf {
        path: path.to_string_lossy().into_owned(),
        bytes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/two-page.pdf")
    }

    #[test]
    fn reads_a_pdf_fixture_from_disk() {
        let bytes = read_pdf_file(&fixture_path()).expect("fixture should be readable");
        assert!(!bytes.is_empty(), "fixture should not be empty");
        assert!(
            bytes.starts_with(b"%PDF-"),
            "fixture should start with the PDF magic header"
        );
    }

    #[test]
    fn reports_an_error_for_a_missing_file() {
        let missing = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/does-not-exist.pdf");
        assert!(read_pdf_file(&missing).is_err());
    }

    #[test]
    fn allows_a_file_at_the_limit() {
        assert!(ensure_within_limit(MAX_PDF_BYTES, MAX_PDF_BYTES).is_ok());
    }

    #[test]
    fn rejects_a_file_over_the_limit() {
        let err = ensure_within_limit(MAX_PDF_BYTES + 1, MAX_PDF_BYTES);
        assert!(matches!(err, Err(ReadError::TooLarge { .. })));
    }
}
