mod pdf_io;

use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(pdf_io::GrantedPaths::default())
        .invoke_handler(tauri::generate_handler![
            pdf_io::open_pdf,
            pdf_io::save_pdf,
            pdf_io::save_pdf_as,
            pdf_io::open_image
        ])
        // Drag-and-drop is handled in Rust so the dropped path is read and
        // granted backend-side and only the bytes reach the webview — the JS
        // surface never gains an arbitrary-path read.
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(drag) = event {
                match drag {
                    DragDropEvent::Enter { .. } | DragDropEvent::Over { .. } => {
                        let _ = window.emit("pdf-drag-over", true);
                    }
                    DragDropEvent::Leave => {
                        let _ = window.emit("pdf-drag-over", false);
                    }
                    DragDropEvent::Drop { paths, .. } => {
                        let _ = window.emit("pdf-drag-over", false);
                        let Some(path) = paths.first() else {
                            return;
                        };
                        let granted = window.state::<pdf_io::GrantedPaths>();
                        match pdf_io::read_dropped_pdf(&granted.0, path) {
                            Ok(opened) => {
                                let _ = window.emit("pdf-dropped", opened);
                            }
                            Err(err) => {
                                let _ = window.emit("pdf-drop-error", err.to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
