import type { RoleKey } from './user.model';

/** The name of a role in the user's language (the keys are what the API stores). */
export function roleLabel(key: RoleKey): string {
  switch (key) {
    case 'viewer':
      return $localize`:@@role.viewer:Viewer`;
    case 'editor':
      return $localize`:@@role.editor:Editor`;
    case 'admin':
      return $localize`:@@role.admin:Admin`;
    case 'site_admin':
      return $localize`:@@role.site-admin:Site admin`;
  }
}
