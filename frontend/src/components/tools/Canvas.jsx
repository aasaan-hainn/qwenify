import { Excalidraw } from "@excalidraw/excalidraw";

export default function Canvas() {
    return (
        <div style={{
            width: "100%",
            height: "calc(100vh - 200px)",  // Viewport height minus header and padding
            minHeight: "400px"
        }}>
            <Excalidraw theme="dark" />
        </div>
    );
}