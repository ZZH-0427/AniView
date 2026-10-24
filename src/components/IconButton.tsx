import type { ComponentPropsWithRef } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> & {
  icon: IconName
  label: string
  text?: string
}

/** Native button behavior, with one accessible name shared by label and tooltip. */
export function IconButton({ icon, label, text, title = label, className, type = 'button', ...props }: IconButtonProps) {
  return <button {...props} type={type} className={['icon-button', className].filter(Boolean).join(' ')}
    aria-label={label} title={title}><Icon name={icon} />{text && <span>{text}</span>}</button>
}
