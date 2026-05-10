import {
    Camera,
    Clock,
    FileSearch,
    MapPin,
    Plus,
    Search,
    ShieldCheck,
    User as UserIcon,
    X,
    MessageSquare,
} from 'lucide-preact';
import type { Map as MapInstance, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { HoverButton } from '../components/ui/HoverButton';
import {
    createLostDocument,
    fetchLostDocuments,
    getLostDocumentImageUrl,
} from '../lib/lostDocumentApi';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useLocation } from 'wouter';
import { startDirectConversation } from '../lib/chatApi';
import { fetchCurrentUser } from '../lib/userApi';
import type { LostDocument } from '../types';
import 'maplibre-gl/dist/maplibre-gl.css';

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
}

export function LostDocuments() {
    const { theme } = useTheme();
    const { session } = useAuth();
    const [, setLocationRouter] = useLocation();
    const [docs, setDocs] = useState<LostDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [posting, setPosting] = useState(false);
    const [postError, setPostError] = useState<string | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<LostDocument | null>(null);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapInstance | null>(null);
    const markerRef = useRef<Marker | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const mapStyle = theme === 'dark' ? DARK_STYLE : LIGHT_STYLE;

    useEffect(() => {
        loadDocs();
        fetchCurrentUser()
            .then((u) => {
                if (u.lat !== 0 || u.lng !== 0) setLocation({ lat: u.lat, lng: u.lng });
            })
            .catch(() => {});
    }, []);

    const loadDocs = async () => {
        setLoading(true);
        try {
            const data = await fetchLostDocuments();
            setDocs(data);
        } catch (err) {
            console.error('Failed to load docs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!showForm || !mapContainerRef.current) return;

        let disposed = false;

        const initMap = async () => {
            try {
                const [maplibregl] = await Promise.all([import('maplibre-gl')]);
                if (disposed || !mapContainerRef.current) return;

                const initial = location || { lat: 0, lng: 0 };
                const map = new maplibregl.Map({
                    container: mapContainerRef.current,
                    style: mapStyle,
                    center: [initial.lng, initial.lat],
                    zoom: 13,
                    attributionControl: false,
                });

                mapRef.current = map;
                map.on('load', () => {
                    if (disposed) return;
                    const marker = new maplibregl.Marker({
                        draggable: true,
                        color: 'var(--accent)',
                    })
                        .setLngLat([initial.lng, initial.lat])
                        .addTo(map);

                    markerRef.current = marker;
                    marker.on('dragend', () => {
                        const next = marker.getLngLat();
                        setLocation({ lat: next.lat, lng: next.lng });
                    });

                    map.on('click', (e) => {
                        marker.setLngLat(e.lngLat);
                        setLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                    });
                });
            } catch (err) {
                console.error('Map init failed:', err);
            }
        };

        initMap();
        return () => {
            disposed = true;
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, [showForm]);

    const handlePost = async () => {
        if (!title.trim() || !description.trim() || !file || !location) {
            setPostError('All fields including image and location are required.');
            return;
        }

        setPosting(true);
        setPostError(null);
        try {
            const formData = new FormData();
            formData.append('title', title.trim());
            formData.append('description', description.trim());
            formData.append('lat', location.lat.toString());
            formData.append('lng', location.lng.toString());
            formData.append('image', file);

            await createLostDocument(formData);
            await loadDocs();
            setShowForm(false);
            setTitle('');
            setDescription('');
            setFile(null);
        } catch (err) {
            setPostError((err as Error).message || 'Failed to post.');
        } finally {
            setPosting(false);
        }
    };

    const handleMessageFinder = async () => {
        if (!selectedDoc || actionBusy) return;
        setActionBusy(true);
        try {
            const result = await startDirectConversation(selectedDoc.userId);
            setLocationRouter(`/messages?threadId=${encodeURIComponent(result.threadId)}`);
        } catch (err) {
            console.error('Failed to start chat:', err);
            alert('Could not start conversation with the finder.');
        } finally {
            setActionBusy(false);
        }
    };

    return (
        <AppLayout title="Lost Documents">
            <div class="stack-v gap-md p-4 max-w-[800px] mx-auto">
                {/* Header Section */}
                <div class="section animate-slide-up">
                    <div class="p-4 stack-h flex-between gap-md items-center">
                        <div class="stack-v" style="gap:2px;">
                            <h2 style="font-size:16px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:8px;">
                                <Search size={18} style="color:var(--accent);" />
                                Smart Recovery
                            </h2>
                            <p style="font-size:12px;color:var(--text-secondary);margin:0;">
                                OCR-powered document matching and secure return
                            </p>
                        </div>
                        <HoverButton onClick={() => setShowForm(!showForm)} class="btn-primary">
                            {showForm ? <X size={14} /> : <Plus size={14} />}
                            {showForm ? 'Cancel' : 'Report Found'}
                        </HoverButton>
                    </div>
                </div>

                {/* Info Notice */}
                {!showForm && (
                    <div
                        class="section bg-(--accent-subtle) border-(--accent-muted) animate-slide-up"
                        style="animation-delay:50ms"
                    >
                        <div class="p-4 stack-h gap-md items-start">
                            <ShieldCheck size={20} style="color:var(--accent);margin-top:2px;" />
                            <div class="stack-v gap-xs">
                                <p style="font-size:13px;font-weight:700;color:var(--accent);margin:0;">
                                    Privacy First OCR
                                </p>
                                <p style="font-size:12px;color:var(--text-secondary);margin:0;line-height:1.4;">
                                    When you report a found document, our AI scans it for names and
                                    birthdays to notify the owner. Sensitive details are
                                    automatically blurred in public listings.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Post Form */}
                {showForm && (
                    <div class="section animate-slide-up">
                        <div class="section-header">
                            <span class="label-caps">Found a Document?</span>
                        </div>
                        <div class="section-body stack-v gap-md">
                            <div class="stack-v gap-xs">
                                <label class="label-caps" style="font-size:10px;">
                                    Title
                                </label>
                                <input
                                    class="input-field"
                                    placeholder="e.g. ID Card found near park"
                                    value={title}
                                    onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                                />
                            </div>
                            <div class="stack-v gap-xs">
                                <label class="label-caps" style="font-size:10px;">
                                    Description
                                </label>
                                <textarea
                                    class="input-field"
                                    rows={3}
                                    placeholder="Any non-sensitive details about the item..."
                                    value={description}
                                    onInput={(e) =>
                                        setDescription((e.target as HTMLTextAreaElement).value)
                                    }
                                />
                            </div>
                            <div class="stack-v gap-xs">
                                <label class="label-caps" style="font-size:10px;">
                                    Document Image
                                </label>
                                <button
                                    type="button"
                                    class="input-field flex-center w-full"
                                    style="height:120px;border-style:dashed;cursor:pointer;position:relative;background:none;padding:0;"
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Upload document image"
                                >
                                    {file ? (
                                        <p style="font-size:12px;color:var(--text);">{file.name}</p>
                                    ) : (
                                        <div class="stack-v gap-sm items-center text-(--text-tertiary)">
                                            <Camera size={24} />
                                            <span style="font-size:12px;">
                                                Tap to upload or take photo
                                            </span>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style="display:none"
                                        accept="image/*"
                                        onChange={(e) =>
                                            setFile(e.currentTarget.files?.[0] || null)
                                        }
                                    />
                                </button>
                            </div>
                            <div class="stack-v gap-xs">
                                <label class="label-caps" style="font-size:10px;">
                                    Discovery Location
                                </label>
                                <div
                                    ref={mapContainerRef}
                                    style="height:200px;border-radius:12px;overflow:hidden;border:1px solid var(--border);"
                                />
                            </div>

                            {postError && (
                                <p style="font-size:12px;color:var(--danger);margin:0;">
                                    {postError}
                                </p>
                            )}

                            <HoverButton
                                onClick={handlePost}
                                disabled={posting}
                                class="btn-primary w-full h-[40px]"
                            >
                                {posting ? 'Processing OCR...' : 'Submit Report'}
                            </HoverButton>
                        </div>
                    </div>
                )}

                {/* List of Docs */}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                    {loading ? (
                        [1, 2, 3, 4].map((i) => (
                            <div key={i} class="section h-[280px] animate-pulse bg-(--bg-muted)" />
                        ))
                    ) : docs.length === 0 ? (
                        <div class="col-span-full py-12 text-center stack-v items-center gap-md">
                            <FileSearch size={40} style="color:var(--text-tertiary);" />
                            <div class="stack-v gap-xs">
                                <p style="font-size:14px;font-weight:700;color:var(--text);margin:0;">
                                    No documents reported
                                </p>
                                <p style="font-size:12px;color:var(--text-secondary);margin:0;">
                                    Found documents in your area will appear here.
                                </p>
                            </div>
                        </div>
                    ) : (
                        docs.map((doc) => (
                            <button
                                type="button"
                                key={doc.id}
                                class="section overflow-hidden cursor-pointer hover:border-(--accent) transition-colors animate-slide-up p-0 text-left w-full"
                                onClick={() => setSelectedDoc(doc)}
                                style="background:none;"
                            >
                                <div style="position:relative;height:160px;background:var(--bg-muted);">
                                    <img
                                        src={getLostDocumentImageUrl(doc.redactedImagePath)}
                                        alt=""
                                        style="width:100%;height:100%;object-fit:cover;"
                                    />
                                    <div style="position:absolute;top:10px;left:10px;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);color:white;font-size:10px;font-weight:700;">
                                        {doc.status.toUpperCase()}
                                    </div>
                                </div>
                                <div class="p-4 stack-v gap-sm">
                                    <div class="stack-h flex-between items-start">
                                        <p style="font-size:14px;font-weight:700;color:var(--text);margin:0;">
                                            {doc.title}
                                        </p>
                                        <div
                                            class="stack-h gap-xs items-center text-(--text-tertiary)"
                                            style="font-size:10px;"
                                        >
                                            <Clock size={10} />
                                            {timeAgo(doc.createdAt)}
                                        </div>
                                    </div>
                                    <p style="font-size:12px;color:var(--text-secondary);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;">
                                        {doc.description}
                                    </p>
                                    <div class="stack-h gap-md items-center mt-1">
                                        <div
                                            class="stack-h gap-xs items-center text-(--text-tertiary)"
                                            style="font-size:11px;"
                                        >
                                            <MapPin size={11} />
                                            {doc.lat.toFixed(4)}, {doc.lng.toFixed(4)}
                                        </div>
                                        {doc.matchedUserId && (
                                            <div
                                                class="stack-h gap-xs items-center text-(--success)"
                                                style="font-size:11px;font-weight:700;"
                                            >
                                                <ShieldCheck size={11} />
                                                Owner Notified
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedDoc && (
                <div class="modal-overlay" role="dialog" aria-modal="true">
                    <div
                        class="absolute inset-0"
                        onClick={() => setSelectedDoc(null)}
                        aria-hidden="true"
                    />
                    <div class="modal-content max-w-[500px]">
                        <div class="p-4 border-b border-(--border) stack-h flex-between items-center">
                            <h3 style="font-size:15px;font-weight:800;margin:0;">
                                Document Details
                            </h3>
                            <HoverButton onClick={() => setSelectedDoc(null)} class="btn-icon">
                                <X size={18} />
                            </HoverButton>
                        </div>
                        <div class="stack-v">
                            <div style="height:250px;background:var(--bg-muted);">
                                <img
                                    src={getLostDocumentImageUrl(selectedDoc.redactedImagePath)}
                                    alt=""
                                    style="width:100%;height:100%;object-fit:contain;"
                                />
                            </div>
                            <div class="p-5 stack-v gap-md">
                                <div class="stack-v gap-xs">
                                    <h4 style="font-size:16px;font-weight:800;margin:0;">
                                        {selectedDoc.title}
                                    </h4>
                                    <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.5;">
                                        {selectedDoc.description}
                                    </p>
                                </div>
                                <div class="stack-v gap-sm pt-2 border-t border-(--border)">
                                    <div class="stack-h gap-sm items-center">
                                        <div class="w-8 h-8 rounded-lg bg-(--bg-muted) flex-center">
                                            <UserIcon
                                                size={14}
                                                style="color:var(--text-tertiary);"
                                            />
                                        </div>
                                        <div class="stack-v">
                                            <span
                                                style="font-size:10px;color:var(--text-tertiary);font-weight:700;"
                                                class="label-caps"
                                            >
                                                FOUND BY
                                            </span>
                                            <span style="font-size:13px;font-weight:600;">
                                                {selectedDoc.userName}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="stack-h gap-sm items-center">
                                        <div class="w-8 h-8 rounded-lg bg-(--bg-muted) flex-center">
                                            <MapPin size={14} style="color:var(--text-tertiary);" />
                                        </div>
                                        <div class="stack-v">
                                            <span
                                                style="font-size:10px;color:var(--text-tertiary);font-weight:700;"
                                                class="label-caps"
                                            >
                                                LOCATION
                                            </span>
                                            <span style="font-size:13px;font-weight:600;">
                                                {selectedDoc.lat.toFixed(5)},{' '}
                                                {selectedDoc.lng.toFixed(5)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="bg-(--bg-muted) p-4 rounded-xl stack-v gap-xs">
                                    <p style="font-size:12px;font-weight:700;margin:0;">
                                        Automated Matching
                                    </p>
                                    <p style="font-size:11px;color:var(--text-secondary);margin:0;">
                                        Our AI automatically scans found documents. If the legal info matches your profile, you will instantly receive a secure notification with next steps to safely recover your item.
                                    </p>
                                </div>
                                {session?.user.id === selectedDoc.matchedUserId && (
                                    <HoverButton 
                                        onClick={handleMessageFinder}
                                        disabled={actionBusy}
                                        class="btn-primary w-full h-[40px]"
                                        style="gap:8px;"
                                    >
                                        <MessageSquare size={16} />
                                        Contact Finder
                                    </HoverButton>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
