"use client"
import React, { useEffect, useState } from "react";

export default function TestComponent() {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const handleClick = () => {
        console.log("Changing URL");
        setAudioUrl("test.com");
    };

    useEffect(() => {
        console.log(audioUrl);
    }, [audioUrl]);

    return (
        <div>
            <button onClick={handleClick}>Change URL</button>
            <div className="text-2xl">{audioUrl}</div>
            <div>
                <p>Lorem ipsumss do11r sidt amet.</p>
                <p>Consectetur adipiscing elit.</p>
            </div>
        </div>
    );
}
