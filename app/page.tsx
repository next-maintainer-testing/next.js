import "./main.css"
import React from 'react'
import TestComponent from './testComponent'

export default function TestPage() {
    return (
        <div className="flex h-screen items-center justify-center">
            <div className="text-center flex flex-col">
                <TestComponent />
            </div>
        </div>
    )
}
