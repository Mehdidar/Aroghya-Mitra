import { createContext, useContext } from 'react';

/**
 * Extra bottom space a layout's floating button needs (the patient 108 button), so the
 * last item on a screen can always scroll clear of it. 0 where there is no floating button.
 */
export const FabInsetContext = createContext(0);
export const useFabInset = () => useContext(FabInsetContext);
