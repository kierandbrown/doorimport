// Updated to handle different logic for each file type
import React, { useState, useEffect, useRef } from "react";
import { Dialog } from '@headlessui/react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export default function MPRViewer() {
    const [recentlyDeleted, setRecentlyDeleted] = useState(null);
    const [filesData, setFilesData] = useState([]);
    const [quantities, setQuantities] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [zoom, setZoom] = useState(1);
    const svgRef = useRef(null);
    const [showSummary, setShowSummary] = useState(false);
    const CARD_HEIGHT = 600;
    const [show3D, setShow3D] = useState(null);
    const Panel3D = ({ width, height, holes }) => {
        const safeWidth = width > 0 ? width : 100;
        const safeHeight = height > 0 ? height : 100;

        const panelX = 0;
        const panelY = 0;

        return (
            <group>
                <mesh position={[panelX, panelY, 0]}>
                    <boxGeometry args={[safeWidth, safeHeight, 18]} />
                    <meshStandardMaterial color="lightgray" />
                </mesh>
                {holes.map((hole, idx) => {
                    if (isNaN(hole.XA) || isNaN(hole.YA) || isNaN(hole.DU)) return null;

                    const x = hole.YA - safeWidth / 2;
                    const y = -(hole.XA - safeHeight / 2);

                    return (
                        <mesh
                            key={idx}
                            position={[x, y, 2.5]}
                            rotation={[Math.PI / 2, 0, 0]}
                        >
                            <cylinderGeometry args={[hole.DU / 2, hole.DU / 2, hole.TI || 6, 32]} />
                            <meshStandardMaterial color="red" />
                        </mesh>
                    );
                })}
            </group>
        );
    };




    const ThreeDModal = ({ file, onClose }) => {

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-white w-full max-w-6xl h-[90vh] rounded-xl shadow-xl relative flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="text-xl font-bold">3D View: {file.name.replace(/\.\w+$/, '')}</h2>
                        <button
                            onClick={onClose}
                            className="bg-red-600 text-white px-4 py-1 rounded hover:bg-red-700"
                        >
                            Close
                        </button>
                    </div>
                    <div className="flex-1">
                        <Canvas camera={{ position: [0, 0, Math.max(file.width, file.height) * 1.5], fov: 45, near: 0.1, far: 5000 }}>

                            <ambientLight intensity={0.6} />
                            <directionalLight position={[150, 150, 300]} intensity={1} />
                            <Panel3D width={file.width} height={file.height} holes={file.holes} />
                            <OrbitControls
                                target={[0, 0, 0]}
                                enableZoom={true}
                                enablePan={true}
                                maxDistance={Math.max(file.width, file.height) * 2}
                            />
                        </Canvas>




                    </div>
                </div>
            </div>
        );
    };



    const handleWheelZoom = (e) => {
        e.preventDefault();
        const svg = svgRef.current;
        if (!svg) return;

        const rect = svg.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const originX = (offsetX / rect.width) * 100;
        const originY = (offsetY / rect.height) * 100;

        let newZoom = zoom + (e.deltaY > 0 ? -0.1 : 0.1);
        newZoom = Math.min(Math.max(newZoom, 0.5), 5);

        setZoom(newZoom);
        svg.style.transformOrigin = `${originX}% ${originY}%`;
        svg.style.transform = `scale(${newZoom})`;
    };

    const handleDoubleClickReset = () => {
        const svg = svgRef.current;
        if (svg) {
            setZoom(1);
            svg.style.transform = 'scale(1)';
            svg.style.transformOrigin = '50% 50%';
        }
    };

    const handleRemoveAll = () => {
        if (window.confirm("Are you sure you want to remove all panels?")) {
            setFilesData([]);
            setQuantities([]);
        }
    };

    const handleQuantityChange = (index, delta) => {
        setQuantities((prev) => {
            const updated = [...prev];
            updated[index] += delta;
            if (updated[index] <= 0) {
                const removedFile = filesData[index];
                const removedQty = quantities[index];
                setRecentlyDeleted({ file: removedFile, qty: removedQty, index });
                setFilesData((prev) => prev.filter((_, i) => i !== index));
                return updated.filter((_, i) => i !== index);
            }
            return updated;
        });
    };

    useEffect(() => {
        const preventDefault = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handleWindowDrop = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const newFiles = Array.from(event.dataTransfer.files).filter((f) =>
                f.name.endsWith(".mpr") || f.name.endsWith(".bpp") || f.name.endsWith(".cix")
            );

            const parsedData = await Promise.all(
                newFiles.map(async (f) => {
                    const text = await f.text();
                    const fileName = f.name.toLowerCase();

                    if (fileName.endsWith(".bpp")) {
                        const widthMatch = text.match(/PAN=LPY\|(\d+)/);
                        const heightMatch = text.match(/PAN=LPX\|(\d+)/);
                        const holeLines = text.split('\n').filter(line => line.startsWith("@ BV"));

                        const holes = holeLines.map(line => {
                            const parts = line.match(/(?:"[^"]*"|[^,])+/g)?.map(p => p.replace(/^"|"$/g, '').trim());

                            const YA = parseFloat(parts[8]);  // width
                            const XA = parseFloat(parts[7]);  // height
                            const TI = parseFloat(parts[10]); // depth
                            const DU = parseFloat(parts[11]); // diameter
                            return { XA, YA, TI, DU };
                        });

                        return {
                            name: f.name,
                            width: parseFloat(widthMatch?.[1] || 0),
                            height: parseFloat(heightMatch?.[1] || 0),
                            holes,
                        };
                    } else if (fileName.endsWith(".cix")) {
                        const widthMatch = text.match(/LPY=(\d+(\.\d+)?)/);
                        const heightMatch = text.match(/LPX=(\d+(\.\d+)?)/);

                        const macros = text.split(/BEGIN MACRO|END MACRO/);
                        const holes = macros
                            .filter(block => block.includes("NAME=BV"))
                            .map(block => {
                                const getValue = (name) => {
                                    const match = block.match(new RegExp(`PARAM,NAME=${name},VALUE=([^\\n]+)`));
                                    return match ? parseFloat(match[1].replace(/\\\"/g, '').trim()) : NaN;
                                };
                                return {
                                    YA: getValue("Y"),    // width
                                    XA: getValue("X"),    // height
                                    TI: getValue("DP"),   // depth
                                    DU: getValue("DIA")   // diameter
                                };
                            });

                        return {
                            name: f.name,
                            width: parseFloat(widthMatch?.[1] || 0),
                            height: parseFloat(heightMatch?.[1] || 0),
                            holes,
                        };
                    } else {
                        const bsxMatch = text.match(/BSX=(\d+(\.\d+)?)/);
                        const bsyMatch = text.match(/BSY=(\d+(\.\d+)?)/);
                        const blocks = text.split('<');
                        const holes = blocks
                            .filter(b => b.includes('BohrVert'))
                            .map(b => {
                                const holeData = {};
                                const attrs = b.match(/(\w+)="([^\"]*)"/g);
                                if (attrs) {
                                    attrs.forEach(attr => {
                                        const [key, value] = attr.split('=');
                                        holeData[key.trim()] = parseFloat(value.replace(/"/g, ''));
                                    });
                                }
                                return holeData;
                            });

                        return {
                            name: f.name,
                            width: parseFloat(bsyMatch?.[1] || 0),
                            height: parseFloat(bsxMatch?.[1] || 0),
                            holes,
                        };
                    }
                })
            );

            const valid = parsedData.filter(Boolean);
            setFilesData((prev) => [...prev, ...valid]);
            setQuantities((prev) => [...prev, ...new Array(valid.length).fill(1)]);
        };

        window.addEventListener("dragover", preventDefault);
        window.addEventListener("drop", handleWindowDrop);
        return () => {
            window.removeEventListener("dragover", preventDefault);
            window.removeEventListener("drop", handleWindowDrop);
        };
    }, []);

    useEffect(() => {
        if (recentlyDeleted) {
            const timer = setTimeout(() => {
                setRecentlyDeleted(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [recentlyDeleted]);
    if (showSummary) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold">Panel Summary</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowSummary(false)}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                            Back
                        </button>
                        <button
                            onClick={() => {
                                alert("Thank you for your order!");
                                setFilesData([]);
                                setQuantities([]);
                                setShowSummary(false);
                            }}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                        >
                            Complete
                        </button>

                    </div>
                </div>

                <div className="bg-white shadow rounded-xl p-4">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b">
                                <th className="p-2">Panel</th>
                                <th className="p-2">Height (mm)</th>
                                <th className="p-2">Width (mm)</th>
                                <th className="p-2">Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filesData.map((file, index) => (
                                <tr key={index} className="border-b hover:bg-gray-100">
                                    <td className="p-2 font-medium">{file.name.replace(/\.\w+$/, '')}</td>
                                    <td className="p-2">{file.height}</td>
                                    <td className="p-2">{file.width}</td>
                                    <td className="p-2 flex items-center gap-2">
                                        <button
                                            className="bg-gray-300 px-2 rounded text-lg"
                                            onClick={() => handleQuantityChange(index, -1)}
                                        >-</button>
                                        <span className="w-8 text-center">{quantities[index]}</span>
                                        <button
                                            className="bg-gray-300 px-2 rounded text-lg"
                                            onClick={() => handleQuantityChange(index, 1)}
                                        >+</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="text-right font-bold text-lg mt-4">
                        Total: {quantities.reduce((sum, q) => sum + q, 0)}
                    </div>
                </div>
            </div>

        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {selectedFile && (
                <Dialog open={true} onClose={() => setSelectedFile(null)} className="relative z-50">
                    <div className="fixed inset-0 bg-black bg-opacity-50" aria-hidden="true" />
                    <div className="fixed inset-0 flex items-center justify-center p-4">
                        <Dialog.Panel className="bg-white p-6 rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden relative">
                            <Dialog.Title className="text-2xl font-bold mb-4">
                                {selectedFile.name.replace(/\.\w+$/, '')}
                            </Dialog.Title>
                            <div className="w-full h-full flex items-center justify-center">
                                <svg
                                    ref={svgRef}
                                    onWheel={handleWheelZoom}
                                    onDoubleClick={handleDoubleClickReset}
                                    viewBox={`0 0 ${selectedFile.width + 100} ${selectedFile.height + 100}`}
                                    className="w-full h-auto max-h-[75vh]"
                                    preserveAspectRatio="xMidYMid meet"
                                >
                                    <rect
                                        x={50}
                                        y={50}
                                        width={selectedFile.width}
                                        height={selectedFile.height}
                                        fill="#f9fafb"
                                        stroke="black"
                                    />
                                    <text x={selectedFile.width / 2 + 50} y={45} textAnchor="middle" fontSize="40" fill="black">
                                        Width: {selectedFile.width}mm
                                    </text>
                                    <text x={10} y={selectedFile.height / 2 + 50} textAnchor="middle" fontSize="40" fill="black" transform={`rotate(-90, 10, ${selectedFile.height / 2 + 50})`}>
                                        Height: {selectedFile.height}mm
                                    </text>
                                    {selectedFile.holes.map((hole, idx) => (
                                        !isNaN(hole.YA) && !isNaN(hole.XA) && !isNaN(hole.DU) && (
                                            <circle
                                                key={idx}
                                                cx={hole.YA + 50}
                                                cy={hole.XA + 50}
                                                r={hole.DU / 2}
                                                fill="red"
                                                stroke="black"
                                                strokeWidth="0.5"
                                            >
                                                <title>{`X: ${hole.XA}, Y: ${hole.YA}, Ø${hole.DU}, Depth: ${hole.TI}`}</title>
                                            </circle>
                                        )
                                    ))}
                                </svg>
                            </div>
                            <div className="absolute top-4 right-4 z-10">
                                <button
                                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                                    onClick={() => {
                                        setZoom(1);
                                        setSelectedFile(null);
                                    }}
                                >
                                    Close
                                </button>
                            </div>
                        </Dialog.Panel>
                    </div>
                </Dialog>
            )}

            {recentlyDeleted && (
                <div className="fixed bottom-6 right-6 z-50 bg-white border border-gray-300 rounded-xl shadow-lg p-4 flex items-center gap-4">
                    <span className="text-gray-800 font-medium">
                        Removed <strong>{recentlyDeleted.file.name.replace(/\.\w+$/, '')}</strong>
                    </span>
                    <button
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        onClick={() => {
                            setFilesData((prev) => {
                                const updated = [...prev];
                                updated.splice(recentlyDeleted.index, 0, recentlyDeleted.file);
                                return updated;
                            });
                            setQuantities((prev) => {
                                const updated = [...prev];
                                updated.splice(recentlyDeleted.index, 0, recentlyDeleted.qty);
                                return updated;
                            });
                            setRecentlyDeleted(null);
                        }}
                    >
                        Undo
                    </button>
                    <button
                        className="text-gray-500 hover:text-gray-700"
                        onClick={() => setRecentlyDeleted(null)}
                        title="Dismiss"
                    >
                        ✕
                    </button>
                </div>
            )}

            <div className="sticky top-0 z-10 bg-gray-50 p-4 border-b-2 border-gray-300">
                <div className="flex justify-between items-center mb-2">
                    <div className="text-xl font-semibold text-blue-700">
                        Total Quantity: {quantities.reduce((total, qty) => total + qty, 0)}
                    </div>
                    <button
                        onClick={handleRemoveAll}
                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                    >
                        Remove All
                    </button>
                    <button
                        onClick={() => setShowSummary(true)}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                        Next Page
                    </button>

                </div>
                <div className="border-dashed border-4 border-gray-400 p-4 text-center rounded-xl">
                    <p className="text-lg text-gray-600">Drag and drop door files anywhere in the window</p>
                </div>
            </div>

            <div className="p-4 overflow-y-auto h-[calc(100vh-120px)]">
                <div className="flex flex-wrap gap-4 justify-start">
                    {filesData.map((file, index) => {
                        const maxDimension = Math.max(file.width, file.height);
                        const scale = CARD_HEIGHT / maxDimension;
                        const displayWidth = file.width * scale;
                        const displayHeight = CARD_HEIGHT;
                        const offsetX = 50;
                        const offsetY = 50;

                        return (
                            <div
                                key={index}
                                className="bg-white p-6 rounded-xl shadow mx-auto relative flex flex-col items-center"
                                style={{ width: displayWidth + 140 }}
                            >
                                <h2 className="text-2xl font-bold truncate text-center w-full mb-2">
                                    {file.name.replace(/\.\w+$/i, '')}
                                </h2>
                                <svg
                                    onClick={() => setSelectedFile(file)}
                                    viewBox={`0 0 ${displayWidth + 140} ${displayHeight + 140}`}
                                    width={displayWidth + 140}
                                    height={displayHeight + 140}
                                    className="border block cursor-pointer hover:bg-gray-100"
                                >
                                    <rect
                                        x={offsetX}
                                        y={offsetY}
                                        width={file.width * scale}
                                        height={file.height * scale}
                                        fill="#f9fafb"
                                        stroke="black"
                                    />
                                    <text x={displayWidth / 2 + offsetX} y={offsetY - 10} textAnchor="middle" fontSize="20" fill="black">
                                        {file.width}mm
                                    </text>
                                    <text
                                        x={offsetX - 10}
                                        y={displayHeight / 2 + offsetY}
                                        textAnchor="middle"
                                        fontSize="20"
                                        fill="black"
                                        transform={`rotate(-90, ${offsetX - 10}, ${displayHeight / 2 + offsetY})`}
                                    >
                                        {file.height}mm
                                    </text>
                                    {file.holes.map((hole, idx) => (
                                        !isNaN(hole.YA) && !isNaN(hole.XA) && !isNaN(hole.DU) && (
                                            <circle
                                                key={idx}
                                                cx={hole.YA * scale + offsetX}
                                                cy={hole.XA * scale + offsetY}
                                                r={(hole.DU / 2) * scale}
                                                fill="red"
                                                stroke="black"
                                                strokeWidth="0.5"
                                            >
                                                <title>{`X: ${hole.XA}, Y: ${hole.YA}, Ø${hole.DU}, Depth: ${hole.TI}`}</title>
                                            </circle>
                                        )
                                    ))}
                                </svg>
                                <div className="flex items-center gap-4 justify-center mt-4">
                                    <button
                                        className="bg-gray-300 p-3 rounded-full text-white text-2xl font-bold"
                                        onClick={() => handleQuantityChange(index, -1)}
                                    >
                                        -
                                    </button>
                                    <span className="text-2xl font-bold">Qty: {quantities[index]}</span>
                                    <button
                                        className="bg-gray-300 p-3 rounded-full text-white text-2xl font-bold"
                                        onClick={() => handleQuantityChange(index, 1)}
                                    >
                                        +
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShow3D(file)}
                                    className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                                >
                                    View in 3D
                                </button>


                            </div>

                        );
                    })}

                </div>
                {show3D && (
                    <ThreeDModal file={show3D} onClose={() => setShow3D(null)} />
                )}
            </div>

        </div>
    );
}
