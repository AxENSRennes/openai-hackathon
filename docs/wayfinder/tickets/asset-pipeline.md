# Define the cameo asset and simulation seam

Type: Grilling (decision recorded)
Status: Resolved

## Question

What asset representation and lifecycle should carry the host's photo-inspired cameo from photo submission or pre-captured selection into the shared clients, and where should the seam sit between cameo presentation and the authoritative server's event scheduling and effects?

## Decision

Use a browser-normalized, square WebP image as the uploaded cameo texture: crop and resize to 512×512, cap the encoded upload at 256 KB, and send it through an HTTP upload endpoint rather than Socket.IO. The server validates the content type, WebP signature, and size, assigns an opaque `characterId`, and retains the bytes in memory only while a current or queued visit refers to them. The shared state carries `characterId` and a same-origin asset URL, never image bytes. Clients render the photo as a framed, color-treated billboard in the existing 3D scene; the phone uses the same asset in a compact 2D preview. This gives a recognizable likeness without an external image-generation service.

If upload, validation, or readiness fails, the host selects one of the bundled pre-captured cameo assets. Those presets use stable IDs and local files. Do not begin a visit until its asset is ready; queued visits retain their selected character ID. Release uploaded bytes when no current or queued visit references them, and clear all remaining uploads at race reset or server shutdown. Do not persist personal photos.

Keep the seam in a server-side `CameoDirector` module that owns trigger queuing, phase timing, outcome rolls, and the compact `cameo` snapshot. It calls a narrow simulation effect operation for the already-decided spill or machine delay. The client scene consumes only the snapshot and asset URL to present the cameo; it cannot roll outcomes or mutate race state. Keep asset storage as the concrete in-memory implementation until a second storage adapter is actually needed.
