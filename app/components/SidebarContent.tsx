'use client'

import { memo, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { SidebarMenuConfig } from './SidebarMenuConfig'
import { usePathname } from 'next/navigation'

interface DynamicSidebarComponentProps {
  componentPath: string
}

const DynamicSidebarComponent = memo(
  ({ componentPath }: DynamicSidebarComponentProps) => {
    const DynamicComponent = useMemo(() => {
      return dynamic(() => import(`${componentPath}`), {
        loading: () => <div>loading...</div>,
      })
    }, [componentPath])
    return <DynamicComponent />
  }
)
DynamicSidebarComponent.displayName = 'DynamicSidebarComponent'

export default function SidebarContent() {
  const pathname = usePathname()
  const relevantPathSegment = pathname.split('/')[1]
  const currentMenu = useMemo(
    () => SidebarMenuConfig.find((menu) => relevantPathSegment === menu.path),
    [relevantPathSegment]
  )
  return currentMenu
    ? <DynamicSidebarComponent componentPath={currentMenu.componentPath} />
    : null
}
