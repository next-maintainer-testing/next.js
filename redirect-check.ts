import { redirect, RedirectType } from 'next/navigation'

redirect('/dashboard/ajustes/empresas', 'push')
redirect('/dashboard/ajustes/empresas', RedirectType.push)
