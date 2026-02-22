import { useEffect, useMemo, useState } from "react";
import { auth, provider, db } from "./firebase";
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    type User,
} from "firebase/auth";
import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
} from "firebase/firestore";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type {Tree} from "./types";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

const CO2_PER_TREE = 22;

const greenIcon = new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
    iconSize: [32, 32],
});

const previewIcon = new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    iconSize: [32, 32],
});

const SPECIES_LIST = [
    "Oak",
    "Pine",
    "Maple",
    "Birch",
    "Cedar",
    "Baobab",
    "Olive",
    "Cherry Blossom",
];
function LocationSelector({ setPosition }: { setPosition: (latlng: { lat: number; lng: number }) => void }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
        },
    });
    return null;
}

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [trees, setTrees] = useState<Tree[]>([]);
    const [species, setSpecies] = useState("");
    const [count, setCount] = useState(1);
    const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
    const [dark, setDark] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "trees"), (snapshot) => {
            const formatted = snapshot.docs.map((doc) => ({
                ...(doc.data() as Omit<Tree, "id">),
                id: doc.id,
            }));
            setTrees(formatted);
        });
        return () => unsub();
    }, []);

    const login = async () => await signInWithPopup(auth, provider);
    const logout = async () => await signOut(auth);

    // Debug: log dark mode state
    useEffect(() => {
        console.log('Dark mode state:', dark);
    }, [dark]);

    const addTree = async () => {
        if (!user || !position) return;

        await addDoc(collection(db, "trees"), {
            userName: user.displayName,
            species,
            count,
            latitude: position.lat,
            longitude: position.lng,
            datePlanted: new Date().toISOString(),
        });

        setPosition(null);
        setSpecies("");
        setCount(1);
    };

    const deleteTree = async (id: string) =>
        await deleteDoc(doc(db, "trees", id));

    const totalTrees = trees.reduce((sum, t) => sum + t.count, 0);
    const totalCO2 = totalTrees * CO2_PER_TREE;
    const totalLocations = new Set(
        trees.map((t) => `${t.latitude}-${t.longitude}`)
    ).size;

    const leaderboard = useMemo(() => {
        const map = new Map<string, number>();
        trees.forEach((t) =>
            map.set(t.userName, (map.get(t.userName) || 0) + t.count)
        );
        return Array.from(map.entries())
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);
    }, [trees]);

    return (
        <div className={`app ${dark ? "dark" : ""}`}>
            <header>
                <h1>🌳 Community Tree Tracker</h1>
                <div>
                    <button onClick={() => setDark(!dark)}>
                        {dark ? "☀ Light Mode" : "🌙 Dark Mode"}
                    </button>
                    {user && (
                        <button onClick={logout} style={{ marginLeft: "10px" }}>
                            👤️ Logout
                        </button>
                    )}
                </div>
            </header>

            {user ? (
                <>
                    <div className="dashboard">
                        <div className="card">
                            <h3>Total Trees</h3>
                            <h2>{totalTrees}</h2>
                        </div>
                        <div className="card">
                            <h3>CO₂ / Year</h3>
                            <h2>{totalCO2} kg</h2>
                        </div>
                        <div className="card">
                            <h3>Total Locations</h3>
                            <h2>{totalLocations}</h2>
                        </div>
                    </div>

                    <div className="form">
                        <input
                            list="species"
                            placeholder="Tree species"
                            value={species}
                            onChange={(e) => setSpecies(e.target.value)}
                        />
                        <datalist id="species">
                            {SPECIES_LIST.map((s) => (
                                <option key={s} value={s}/>
                            ))}
                        </datalist>

                        <input
                            type="number"
                            value={count}
                            min={1}
                            onChange={(e) => setCount(Number(e.target.value))}
                        />
                        <button onClick={addTree}>Add Tree</button>
                    </div>

                    <h2>🗺️ Map</h2>
                    <MapContainer center={[20, 0]} zoom={2} style={{ height: 500 }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <LocationSelector setPosition={setPosition} />

                        {position && (
                            <Marker position={[position.lat, position.lng]} icon={previewIcon}>
                                <Popup>Selected Location</Popup>
                            </Marker>
                        )}

                        {trees.map((tree) => (
                            <Marker
                                key={tree.id}
                                position={[tree.latitude, tree.longitude]}
                                icon={greenIcon}
                            >
                                <Popup>
                                    🌳 {tree.species}
                                    <br />
                                    {tree.count} trees
                                    <br />
                                    {tree.userName}
                                    <br />
                                    <button onClick={() => deleteTree(tree.id)}>Delete</button>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>

                    <h2>🏆 Leaderboard</h2>
                    <div className="leaderboard">
                        {leaderboard.map((entry, i) => (
                            <div key={entry.name} className="leader-card">
                                <span>#{i + 1}</span>
                                <span>{entry.name}</span>
                                <strong>{entry.total} 🌳</strong>
                            </div>
                        ))}
                    </div>

                    <h2>📊 Statistics</h2>
                    <div style={{width: "100%", height: 300}}>
                        <ResponsiveContainer>
                            <BarChart data={leaderboard}>
                                <XAxis 
                                    dataKey="name" 
                                    stroke={dark ? "#e2e8f0" : "#334155"}
                                />
                                <YAxis 
                                    stroke={dark ? "#e2e8f0" : "#334155"}
                                />
                                <Tooltip 
                                    contentStyle={{
                                        backgroundColor: dark ? "#1e293b" : "#ffffff",
                                        border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`,
                                        color: dark ? "#ffffff" : "#000000"
                                    }}
                                />
                                <Bar dataKey="total" fill="#22c55e"/>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>
            ) : (
                <button onClick={login}>Login with Google</button>
            )}
        </div>
    );
}

export default App;