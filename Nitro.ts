namespace Nitro {

	const enum MountedState {
		NOT_MOUNTED,
		MOUNTED_UNDER_ANOTHER_COMPONENT,
		MOUNTED_DIRECTLY_UNDER_ELEMENT
	}

	interface CustomHTMLElement extends HTMLElement {
		__attributes: { [propertyName: string]: any };
		__was_mounted: () => void;
		__was_unmounted: () => void;
	}

	export var DEBUG_MODE = true; // TODO: Provide compiled versions of Nitro with this set to false and related code removal performed?

	export var DIGEST_USING_MICROTASKS = true; // If true then digesting will be performed in a microtask, else requestAnimationFrame will be used. Digesting in a microtask will result in more immediate updates but may result in extra digests in certain circumstances.

	var _dirtyComponents: Component[] = [];

	var _pendingRaf = -1;

	var _microtaskPending = false;
	var _digestOnNextMicrotask = false;

	// var halted = false;

	// function halt() {
	// 	halted = true;
	// }

	// Invoke this method if for some reason you would like for Nitro to immediately re-render all dirtied components rather than wait until the next RAF/microtask event.
	export function digest() {
		// if (halted) return;
		rerenderAllDirtyComponents();
		// If the user requested that we go ahead and digest immediately rather than waiting for the next RAF, cancel the RAF request.
		if (_pendingRaf !== -1) {
			window.cancelAnimationFrame(_pendingRaf);
			_pendingRaf = -1;
		}
		// We cannot cancel microtasks, but we can tell our microtask handler to not perform the digest
		if (_microtaskPending) {
			_digestOnNextMicrotask = false;
		}
	}

	// Note: It is common that a component will be dirtied in the middle of a RAF event.
	// In that case where a parent is dirtying a child(usually by passing it new input) the child is simply appended to the end of the list of dirtied components and rerendered at the end of the current RAF event.
	// TODO: Would it be an optimization to ensure that rerenders happen from top to bottom? As rendering a component will often dirty a child. If we rerender at an arbitrary order we could rerender the child, then parent, then child again.
	function componentWasDirtied(component: Component) {
		// if (halted) return;
		_dirtyComponents.push(component);
		if (DIGEST_USING_MICROTASKS) {
			if (!_microtaskPending) {
				window['queueMicrotask'](queueMicrotaskCallback);
			}
			_digestOnNextMicrotask = true; // Must set this to true whether a microtask is pending or not, in case Nitro.digest() was invoked while a microtask was still pending, then a component is dirtied.
		}
		else if (_pendingRaf === -1) {
			_pendingRaf = window.requestAnimationFrame(requestAnimationFrameCallback);
		}
	}

	function queueMicrotaskCallback() {
		_microtaskPending = false;
		rerenderAllDirtyComponents();
	}

	function requestAnimationFrameCallback() {
		_pendingRaf = -1;
		rerenderAllDirtyComponents();
	}

	function rerenderAllDirtyComponents() {
		try {
			for (const component of _dirtyComponents) {
				// It is possible to have a component in this list that has already be re-rendered if the component was given new input then was added to an element using the children() method as the children() method calls getElement().
				component.getElement();
			}
			_dirtyComponents = [];
		}
		catch (e) {
			console.error('Exception thrown during Nitro.digest().');
			_dirtyComponents = [];
			throw e;
		}
	}

	function removeDirtyComponent(component: Component) {
		const index = _dirtyComponents.indexOf(component);
		if (index !== -1) _dirtyComponents.splice(index, 1);
	}

	export abstract class Component<I = {}> {

		key: string | null = null;

		private _dirty: boolean = true;

		protected element: HTMLElement = null;

		private _renderer: Renderer | null = null;

		private _mountedState = MountedState.NOT_MOUNTED;

		protected input: I = null;

		constructor() {
			if (this.render.length) { // Only instantiate a Renderer if the render method supplied by the subclass takes it as an argument
				this._renderer = new Renderer();
			}
		}

		setInput(input: I) {
			const previous = this.input;
			if (previous !== null || input !== null) { // A special case, don't bother invoking inputChanged() if going from null to null
				this.input = input;
				this.inputChanged(previous, input);
			}
			this.setDirty();
		}

		inputChanged(previous: I, current: I) {} // Can be overidden by subclass

		setDirty() {
			if (!this._dirty) {
				this._dirty = true;
				componentWasDirtied(this);
			}
		}

		isMounted(): boolean {
			return this._mountedState !== 0;
		}

		mountUnder(parent: HTMLElement) {
			if (Nitro.DEBUG_MODE && this._mountedState) throw new Error('mountUnder() called on a component that is already mounted');

			parent.appendChild(this.getElement());
			invokeWasMountedForElement(this.element);
			this._mountedState = MountedState.MOUNTED_DIRECTLY_UNDER_ELEMENT; // the __was_mounted callback will set this to MOUNTED_UNDER_ANOTHER_COMPONENT, so overwrite that here with the correct state
		}

		unmount() {
			if (Nitro.DEBUG_MODE && this._mountedState !== MountedState.MOUNTED_DIRECTLY_UNDER_ELEMENT) {
				throw new Error('Cannot unmount component, component has not been mounted using Component.mountUnder(parent: HTMLElement)');
			}
			this.element.parentElement.removeChild(this.element);
			invokeWasUnmountedForElement(this.element);
		}

		wasMounted() {} // Can be overidden by subclass
		wasUnmounted() {} // Can be overidden by subclass

		getElement(): HTMLElement {
			if (this._dirty) {
				this.rerender();
			}
			return this.element;
		}

		private rerender() {
			let rendered: HTMLElement;
			const renderer = this._renderer;
			try {
				if (renderer === null) {
					rendered = this.render() as HTMLElement;
				}
				else {
					renderer.setupForNewRenderPass();
					rendered = this.render(renderer) as HTMLElement;
					// renderer.clearLeftoverState();
				}
			}
			catch(e) {
				removeDirtyComponent(this);
				throw e;
			}
			if (rendered !== undefined) {
				if (Nitro.DEBUG_MODE && this.element !== null && rendered !== this.element) {
					removeDirtyComponent(this);
					throw new Error('Nitro does not support swapping out the root element of a component! Component: ' + this.constructor.name + '. You may need to add a key to the root element of the component.');
				}
				if (this.element === null) {
					this.element = rendered;
				}
			}
			if ((this.element as CustomHTMLElement).__was_mounted === undefined) {
				this.attachMountHandlers(this.element);
			}
			this._dirty = false;
		}

		abstract render(_?: Renderer): void | HTMLElement;

		private attachMountHandlers(element: HTMLElement) {
			(element as CustomHTMLElement).__was_mounted = () => {
				if (!this._mountedState) { // This check is necessary in the event that a component is being moved from one location in the DOM to another, TODO: Handle this in a more elegant manner?
					this._mountedState = MountedState.MOUNTED_UNDER_ANOTHER_COMPONENT;
					this.wasMounted();
					if (this._dirty) componentWasDirtied(this);
				}
			};
			(element as CustomHTMLElement).__was_unmounted = () => {
				this._mountedState = MountedState.NOT_MOUNTED;
				this.wasUnmounted();
			};
		}

		protected childByKey(key: string): HTMLElement | Component {
			if (this._renderer === null) return null;
			return this._renderer.getElementByKey(key);
		}

	}

	export abstract class PureComponent<I = {}> extends Component<I> {

		setInput(input: I) {
			if (Nitro.DEBUG_MODE && typeof input !== 'object') throw new Error('Non-object input value given to instance of PureComponent, this will produce undesired behavior.');
			const previous = this.input;
			let didChange = false;
			if (previous === null) {
				didChange = true;
			}
			else {
				for (const key in input) {
					if (previous[key] !== input[key]) {
						didChange = true;
						break;
					}
				}
			}
			if (didChange) {
				this.input = input;
				this.inputChanged(previous, input);
				this.setDirty();
			}
		}

	}

	var blankElement = document.createElement('div'); // Keep a blank element to query what the default values for fields are, is there a better approach?

	function clearProperty(element: HTMLElement, name: string) {
		const lowerCaseName = name.toLowerCase();
		if (lowerCaseName in element) name = lowerCaseName; // Use the lowercase name for event handlers
		if (name.startsWith('data-')) {
			element.removeAttribute(name);
		}
		else {
			(element as any)[name] = (blankElement as any)[name];
		}
	}

	function setProperty(element: HTMLElement, name: string, value: any) {
		if (value === undefined) {
			// If "undefined" is sent, clear the property
			clearProperty(element, name);
			return;
		}
		const lowerCaseName = name.toLowerCase();
		if (lowerCaseName in element) name = lowerCaseName; // Use the lowercase name for event handlers
		if (name === 'style' && typeof value === 'object') {
			element.setAttribute('style', ''); // Clear all styles before setting the new ones, is there a better approach here?
			for (const styleKey in value as JSX.CSSProperties) {
				element.style[styleKey as any] = value[styleKey];
			}
		}
		else if (name.startsWith('data-')) {
			element.setAttribute(name, value);
		}
		else if (name !== 'children') {
			(element as any)[name] = value;
		}
	}

	function updateElement(element: HTMLElement, attributes: JSX.HTMLAttributes) {
		const previousAttributes = (element as any).__attributes as JSX.HTMLAttributes;

		// Clear any properties not part of the new set
		for (const prevAttributeName in previousAttributes) {
			if (attributes === null || !(prevAttributeName in attributes)) {
				clearProperty(element, prevAttributeName);
			}
		}

		// Set new properties, if the value is not equivalent to the previous value
		for (const attributeName in attributes) {
			if (attributeName !== 'key') {
				if (previousAttributes === null || (previousAttributes as any)[attributeName] !== (attributes as any)[attributeName]) {
					setProperty(element, attributeName, (attributes as any)[attributeName]);
				}
			}
		}

		(element as CustomHTMLElement).__attributes = attributes;
	}

	export class Renderer {

		private components: Component[] = [];
		private previousComponents: Component[] = [];

		private elements: CustomHTMLElement[] = [];
		private previousElements: CustomHTMLElement[] = [];

		create(tagName: string, attributes: any, ...children: (string | HTMLElement | Nitro.Component | null)[]): HTMLElement;
		create<C extends Component<P>, P extends {}>(componentClass: new () => Component<P>, input?: P | null): HTMLElement;
		create(tagNameOrComponentClass: any, inputOrProperties: any, ...children: (string | HTMLElement | Nitro.Component | null)[]): HTMLElement {

			const key = (inputOrProperties === null || inputOrProperties.key === undefined) ? null : inputOrProperties.key;

			if (children.length > 0) {
				if (inputOrProperties === null) {
					inputOrProperties = { children: children };
				}
				else {
					inputOrProperties.children = children;
				}
			}

			if (typeof tagNameOrComponentClass === 'string') {

				let elem: HTMLElement = null;

				const previousElements = this.previousElements;

				// If a key was specified, look for a previous element with the same key
				if (typeof key === 'string') {
					for (let i = 0; i < previousElements.length; i++) {
						const previousElement = previousElements[i];
						const previousElementKey = previousElement.__attributes ? previousElement.__attributes.key : undefined;
						if (previousElementKey === key) {
							if (Nitro.DEBUG_MODE && previousElement.tagName !== tagNameOrComponentClass.toUpperCase()) {
								throw new Error('Cannot reuse key for an element of a different tagName, current: ' + previousElement.tagName + ', new: ' + tagNameOrComponentClass.toUpperCase() + '.');
							}
							previousElements.splice(i, 1);
							updateElement(previousElement, inputOrProperties);
							elem = previousElement;
							break;
						}
					}
				}

				if (elem === null) {
					// No key was specified or an element with the same key was not found, look for a previous element with the same tag name that does not have a key
					for (let i = 0; i < previousElements.length; i++) {
						const previousElement = previousElements[i];
						const previousElementKey = previousElement.__attributes ? previousElement.__attributes.key : undefined;
						if (previousElementKey === undefined && previousElement.tagName.toLowerCase() === tagNameOrComponentClass.toLowerCase()) {
							previousElements.splice(i, 1);
							updateElement(previousElement, inputOrProperties);
							elem = previousElement;
							break;
						}
					}
				}

				if (elem === null) {
					// No element to reuse, create a new one
					elem = document.createElement(tagNameOrComponentClass);
					if (inputOrProperties !== null) {
						for (const propertyName in inputOrProperties) {
							if (propertyName !== 'key') {
								setProperty(elem, propertyName, inputOrProperties[propertyName]);
							}
						}
					}
					(elem as CustomHTMLElement).__attributes = inputOrProperties;
				}

				const newChildren: Node[] = [];

				children = flatten(children); // TODO: Optimize
				for (const child of children) {
					if (child !== null) {
						let childElem;
						if (typeof child === 'string') {
							childElem = document.createTextNode(child);
						}
						else if (child instanceof HTMLElement) {
							childElem = child;
						}
						else {
							if (Nitro.DEBUG_MODE && !(child instanceof Nitro.Component)) throw new Error('Cannot treat value as child: ' + child + ', must be a string, HTMLElement, Component, or null.');
							childElem = child.getElement();
						}
						newChildren.push(childElem);
					}
				}

				updateElementChildren(elem, newChildren);

				this.elements.push(elem as any);

				return elem;
			}

			let component: Component | null = null;

			const previousComponents = this.previousComponents;

			// If a key was specified, look for a previous component with the same key
			if (typeof key === 'string') {
				for (let i = 0; i < previousComponents.length; i++) {
					const previousComponent = previousComponents[i];
					if (previousComponent.key === key) { // FIXME: What if the user attaches the same key to a component of a different type?
						if (Nitro.DEBUG_MODE && !(previousComponent instanceof tagNameOrComponentClass)) {
							throw new Error('Cannot reuse key for a component of a different class, current: ' + previousComponent.constructor.name + ', new: ' + tagNameOrComponentClass.name + '.');
						}
						previousComponents.splice(i, 1);
						component = previousComponent;
						break;
					}
				}
			}

			if (component === null) {
				// No key was specified or a component with the same key was not found, look for a previous component of the same type that does not have a key
				for (let i = 0; i < previousComponents.length; i++) {
					const previousComponent = previousComponents[i];
					if (previousComponent.key === null && previousComponent instanceof tagNameOrComponentClass) {
						previousComponents.splice(i, 1);
						component = previousComponent as any;
						break;
					}
				}
			}

			if (component === null) {
				// No component to reuse, create a new one
				component = new tagNameOrComponentClass();
			}

			component.setInput(inputOrProperties);

			component.key = key;

			this.components.push(component);

			return component.getElement();
		}

		setupForNewRenderPass() {
			this.previousComponents = this.components;
			this.components = [];

			this.previousElements = this.elements;
			this.elements = [];
		}

		getElementByKey(key: string): HTMLElement | Component | null {
			for (const elem of this.elements) {
				const attributes = elem.__attributes;
				if (attributes && typeof attributes.key === 'string' && attributes.key === key) {
					return elem;
				}
			}
			for (const component of this.components) {
				if (component.key === key) return component;
			}
			return null;
		}

	}

	function updateElementChildren(parent: HTMLElement, children: Node[]) {

		const parentIsMounted = document.body.contains(parent); // TODO: Is there a faster method?

		const currentChildren = parent.childNodes;

		let indexIntoCurrentChildren = 0;
		let indexIntoNewChildren = 0;

		while (indexIntoNewChildren < children.length) {
			const currentChild = currentChildren[indexIntoCurrentChildren];
			const newChild = children[indexIntoNewChildren];
			if (currentChild === undefined) {
				parent.appendChild(newChild);
				if (parentIsMounted && newChild instanceof Element) invokeWasMountedForElement(newChild);
				indexIntoCurrentChildren++;
				indexIntoNewChildren++;
				continue;
			}
			if (currentChildren[indexIntoCurrentChildren] === newChild) {
				indexIntoCurrentChildren++;
				indexIntoNewChildren++;
			}
			else {
				const oldChild = currentChildren[indexIntoCurrentChildren];
				parent.replaceChild(newChild, oldChild);
				if (parentIsMounted) {
					if (oldChild instanceof Element && children.indexOf(oldChild) === -1) {
						invokeWasUnmountedForElement(oldChild);
					}
					if (newChild instanceof Element) invokeWasMountedForElement(newChild);
				}
				indexIntoCurrentChildren++;
				indexIntoNewChildren++;
			}
		}

		// Remove leftover children unaccounted for
		let remainingChildCount = currentChildren.length - indexIntoCurrentChildren;
		while (remainingChildCount > 0) {
			const lastChild = parent.lastChild;
			parent.removeChild(lastChild);
			if (parentIsMounted && lastChild instanceof Element) invokeWasUnmountedForElement(lastChild)
			remainingChildCount--;
		}

	}

	function invokeWasMountedForElement(element: Element) {
		if ((element as CustomHTMLElement).__was_mounted) {
			(element as CustomHTMLElement).__was_mounted();
		}
		const children = element.children;
		for (let i = 0; i < children.length; i++) {
			invokeWasMountedForElement(children[i]);
		}
	}

	function invokeWasUnmountedForElement(element: Element) {
		if ((element as CustomHTMLElement).__was_unmounted) {
			(element as CustomHTMLElement).__was_unmounted();
		}
		const children = element.children;
		for (let i = 0; i < children.length; i++) {
			invokeWasUnmountedForElement(children[i]);
		}
	}

	function flatten<T extends any>(items: T[]) {
		const flattened: T[] = [];
		const length = items.length;
		for (let i = 0; i < length; i++) {
			const item = items[i];
			if (Array.isArray(item)) {
				flattened.push(...item);
			} else {
				flattened.push(item);
			}
		}
		return flattened;
	}

	export function updateChildren(parent: HTMLElement, children: (HTMLElement | Nitro.Component)[]) {
		const childElements = children.map(child => {
			if (child instanceof Nitro.Component) {
				return child.getElement();
			}
			return child;
		});
		updateElementChildren(parent, childElements);
	}

}

window['Nitro'] = Nitro;

type Defaultize<Props, Defaults> =
	// Distribute over unions
	Props extends any // Make any properties included in Default optional
		? Partial<Pick<Props, Extract<keyof Props, keyof Defaults>>> & // Include the remaining properties from Props
				Pick<Props, Exclude<keyof Props, keyof Defaults>>
		: never;

namespace JSX {

	export type LibraryManagedAttributes<Component, Props> = Component extends {
		defaultProps: infer Defaults;
	}
		? Defaultize<Props, Defaults>
		: Props;

	export interface IntrinsicAttributes {
		key?: string;
		// ref?: string; // TODO: Split key into key and ref?
	}

	export type Element = HTMLElement;

	export interface ElementAttributesProperty {
		input: any; // THIS IS IMPORTANT BLACK MAGIC!!! Somehow TypeScript matches this up with the input type for the component class. I have no clue how.
	}

	export interface ElementChildrenAttribute {
		children: any;
	}

	export type DOMCSSProperties = {
		[key in keyof Omit<
			CSSStyleDeclaration,
			| 'item'
			| 'setProperty'
			| 'removeProperty'
			| 'getPropertyValue'
			| 'getPropertyPriority'
		>]?: string | number | null | undefined;
	};
	export type AllCSSProperties = {
		[key: string]: string | number | null | undefined;
	};
	export interface CSSProperties extends AllCSSProperties, DOMCSSProperties {
		cssText?: string | null;
	}

	export interface SVGAttributes<Target extends EventTarget = SVGElement>
		extends HTMLAttributes<Target> {
		accentHeight?: number | string;
		accumulate?: 'none' | 'sum';
		additive?: 'replace' | 'sum';
		alignmentBaseline?:
			| 'auto'
			| 'baseline'
			| 'before-edge'
			| 'text-before-edge'
			| 'middle'
			| 'central'
			| 'after-edge'
			| 'text-after-edge'
			| 'ideographic'
			| 'alphabetic'
			| 'hanging'
			| 'mathematical'
			| 'inherit';
		allowReorder?: 'no' | 'yes';
		alphabetic?: number | string;
		amplitude?: number | string;
		arabicForm?:
			| 'initial'
			| 'medial'
			| 'terminal'
			| 'isolated';
		ascent?: number | string;
		attributeName?: string;
		attributeType?: string;
		autoReverse?: number | string;
		azimuth?: number | string;
		baseFrequency?: number | string;
		baselineShift?: number | string;
		baseProfile?: number | string;
		bbox?: number | string;
		begin?: number | string;
		bias?: number | string;
		by?: number | string;
		calcMode?: number | string;
		capHeight?: number | string;
		clip?: number | string;
		clipPath?: string;
		clipPathUnits?: number | string;
		clipRule?: number | string;
		colorInterpolation?: number | string;
		colorInterpolationFilters?:
			| 'auto'
			| 'sRGB'
			| 'linearRGB'
			| 'inherit';
		colorProfile?: number | string;
		colorRendering?: number | string;
		contentScriptType?: number | string;
		contentStyleType?: number | string;
		cursor?: number | string;
		cx?: number | string;
		cy?: number | string;
		d?: string;
		decelerate?: number | string;
		descent?: number | string;
		diffuseConstant?: number | string;
		direction?: number | string;
		display?: number | string;
		divisor?: number | string;
		dominantBaseline?: number | string;
		dur?: number | string;
		dx?: number | string;
		dy?: number | string;
		edgeMode?: number | string;
		elevation?: number | string;
		enableBackground?: number | string;
		end?: number | string;
		exponent?: number | string;
		externalResourcesRequired?: number | string;
		fill?: string;
		fillOpacity?: number | string;
		fillRule?:
			| 'nonzero'
			| 'evenodd'
			| 'inherit';
		filter?: string;
		filterRes?: number | string;
		filterUnits?: number | string;
		floodColor?: number | string;
		floodOpacity?: number | string;
		focusable?: number | string;
		fontFamily?: string;
		fontSize?: number | string;
		fontSizeAdjust?: number | string;
		fontStretch?: number | string;
		fontStyle?: number | string;
		fontVariant?: number | string;
		fontWeight?: number | string;
		format?: number | string;
		from?: number | string;
		fx?: number | string;
		fy?: number | string;
		g1?: number | string;
		g2?: number | string;
		glyphName?: number | string;
		glyphOrientationHorizontal?: number | string;
		glyphOrientationVertical?: number | string;
		glyphRef?: number | string;
		gradientTransform?: string;
		gradientUnits?: string;
		hanging?: number | string;
		horizAdvX?: number | string;
		horizOriginX?: number | string;
		ideographic?: number | string;
		imageRendering?: number | string;
		in2?: number | string;
		in?: string;
		intercept?: number | string;
		k1?: number | string;
		k2?: number | string;
		k3?: number | string;
		k4?: number | string;
		k?: number | string;
		kernelMatrix?: number | string;
		kernelUnitLength?: number | string;
		kerning?: number | string;
		keyPoints?: number | string;
		keySplines?: number | string;
		keyTimes?: number | string;
		lengthAdjust?: number | string;
		letterSpacing?: number | string;
		lightingColor?: number | string;
		limitingConeAngle?: number | string;
		local?: number | string;
		markerEnd?: string;
		markerHeight?: number | string;
		markerMid?: string;
		markerStart?: string;
		markerUnits?: number | string;
		markerWidth?: number | string;
		mask?: string;
		maskContentUnits?: number | string;
		maskUnits?: number | string;
		mathematical?: number | string;
		mode?: number | string;
		numOctaves?: number | string;
		offset?: number | string;
		opacity?: number | string;
		operator?: number | string;
		order?: number | string;
		orient?: number | string;
		orientation?: number | string;
		origin?: number | string;
		overflow?: number | string;
		overlinePosition?: number | string;
		overlineThickness?: number | string;
		paintOrder?: number | string;
		panose1?: number | string;
		pathLength?: number | string;
		patternContentUnits?: string;
		patternTransform?: number | string;
		patternUnits?: string;
		pointerEvents?: number | string;
		points?: string;
		pointsAtX?: number | string;
		pointsAtY?: number | string;
		pointsAtZ?: number | string;
		preserveAlpha?: number | string;
		preserveAspectRatio?: string;
		primitiveUnits?: number | string;
		r?: number | string;
		radius?: number | string;
		refX?: number | string;
		refY?: number | string;
		renderingIntent?: number | string;
		repeatCount?: number | string;
		repeatDur?: number | string;
		requiredExtensions?: number | string;
		requiredFeatures?: number | string;
		restart?: number | string;
		result?: string;
		rotate?: number | string;
		rx?: number | string;
		ry?: number | string;
		scale?: number | string;
		seed?: number | string;
		shapeRendering?: number | string;
		slope?: number | string;
		spacing?: number | string;
		specularConstant?: number | string;
		specularExponent?: number | string;
		speed?: number | string;
		spreadMethod?: string;
		startOffset?: number | string;
		stdDeviation?: number | string;
		stemh?: number | string;
		stemv?: number | string;
		stitchTiles?: number | string;
		stopColor?: string;
		stopOpacity?: number | string;
		strikethroughPosition?: number | string;
		strikethroughThickness?: number | string;
		string?: number | string;
		stroke?: string;
		strokeDasharray?: string | number;
		strokeDashoffset?: string | number;
		strokeLinecap?:
			| 'butt'
			| 'round'
			| 'square'
			| 'inherit';
		strokeLinejoin?:
			| 'miter'
			| 'round'
			| 'bevel'
			| 'inherit';
		strokeMiterlimit?: string | number;
		strokeOpacity?: number | string;
		strokeWidth?: number | string;
		surfaceScale?: number | string;
		systemLanguage?: number | string;
		tableValues?: number | string;
		targetX?: number | string;
		targetY?: number | string;
		textAnchor?: string;
		textDecoration?: number | string;
		textLength?: number | string;
		textRendering?: number | string;
		to?: number | string;
		transform?: string;
		u1?: number | string;
		u2?: number | string;
		underlinePosition?: number | string;
		underlineThickness?: number | string;
		unicode?: number | string;
		unicodeBidi?: number | string;
		unicodeRange?: number | string;
		unitsPerEm?: number | string;
		vAlphabetic?: number | string;
		values?: string;
		vectorEffect?: number | string;
		version?: string;
		vertAdvY?: number | string;
		vertOriginX?: number | string;
		vertOriginY?: number | string;
		vHanging?: number | string;
		vIdeographic?: number | string;
		viewBox?: string;
		viewTarget?: number | string;
		visibility?: number | string;
		vMathematical?: number | string;
		widths?: number | string;
		wordSpacing?: number | string;
		writingMode?: number | string;
		x1?: number | string;
		x2?: number | string;
		x?: number | string;
		xChannelSelector?: string;
		xHeight?: number | string;
		xlinkActuate?: string;
		xlinkArcrole?: string;
		xlinkHref?: string;
		xlinkRole?: string;
		xlinkShow?: string;
		xlinkTitle?: string;
		xlinkType?: string;
		xmlBase?: string;
		xmlLang?: string;
		xmlns?: string;
		xmlnsXlink?: string;
		xmlSpace?: string;
		y1?: number | string;
		y2?: number | string;
		y?: number | string;
		yChannelSelector?: string;
		z?: number | string;
		zoomAndPan?: string;
	}

	export interface PathAttributes {
		d: string;
	}

	export type TargetedEvent<
		Target extends EventTarget = EventTarget,
		TypedEvent extends Event = Event
	> = Omit<TypedEvent, 'currentTarget'> & {
		readonly currentTarget: Target;
	};

	export type TargetedAnimationEvent<Target extends EventTarget> =
		TargetedEvent<Target, AnimationEvent>;
	export type TargetedClipboardEvent<Target extends EventTarget> =
		TargetedEvent<Target, ClipboardEvent>;
	export type TargetedCompositionEvent<Target extends EventTarget> =
		TargetedEvent<Target, CompositionEvent>;
	export type TargetedDragEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		DragEvent
	>;
	export type TargetedFocusEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		FocusEvent
	>;
	export type TargetedKeyboardEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		KeyboardEvent
	>;
	export type TargetedMouseEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		MouseEvent
	>;
	export type TargetedPointerEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		PointerEvent
	>;
	export type TargetedTouchEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		TouchEvent
	>;
	export type TargetedTransitionEvent<Target extends EventTarget> =
		TargetedEvent<Target, TransitionEvent>;
	export type TargetedUIEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		UIEvent
	>;
	export type TargetedWheelEvent<Target extends EventTarget> = TargetedEvent<
		Target,
		WheelEvent
	>;

	export interface EventHandler<E extends TargetedEvent> {
		/**
		 * The `this` keyword always points to the DOM element the event handler
		 * was invoked on. See: https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Event_handlers#Event_handlers_parameters_this_binding_and_the_return_value
		 */
		(this: never, event: E): void;
	}

	export type AnimationEventHandler<Target extends EventTarget> = EventHandler<
		TargetedAnimationEvent<Target>
	>;
	export type ClipboardEventHandler<Target extends EventTarget> = EventHandler<
		TargetedClipboardEvent<Target>
	>;
	export type CompositionEventHandler<Target extends EventTarget> =
		EventHandler<TargetedCompositionEvent<Target>>;
	export type DragEventHandler<Target extends EventTarget> = EventHandler<
		TargetedDragEvent<Target>
	>;
	export type FocusEventHandler<Target extends EventTarget> = EventHandler<
		TargetedFocusEvent<Target>
	>;
	export type GenericEventHandler<Target extends EventTarget> = EventHandler<
		TargetedEvent<Target>
	>;
	export type KeyboardEventHandler<Target extends EventTarget> = EventHandler<
		TargetedKeyboardEvent<Target>
	>;
	export type MouseEventHandler<Target extends EventTarget> = EventHandler<
		TargetedMouseEvent<Target>
	>;
	export type PointerEventHandler<Target extends EventTarget> = EventHandler<
		TargetedPointerEvent<Target>
	>;
	export type TouchEventHandler<Target extends EventTarget> = EventHandler<
		TargetedTouchEvent<Target>
	>;
	export type TransitionEventHandler<Target extends EventTarget> = EventHandler<
		TargetedTransitionEvent<Target>
	>;
	export type UIEventHandler<Target extends EventTarget> = EventHandler<
		TargetedUIEvent<Target>
	>;
	export type WheelEventHandler<Target extends EventTarget> = EventHandler<
		TargetedWheelEvent<Target>
	>;

	export interface DOMAttributes<Target extends EventTarget> {

		// Image Events
		onLoad?: GenericEventHandler<Target>;
		onLoadCapture?: GenericEventHandler<Target>;
		onError?: GenericEventHandler<Target>;
		onErrorCapture?: GenericEventHandler<Target>;

		// Clipboard Events
		onCopy?: ClipboardEventHandler<Target>;
		onCopyCapture?: ClipboardEventHandler<Target>;
		onCut?: ClipboardEventHandler<Target>;
		onCutCapture?: ClipboardEventHandler<Target>;
		onPaste?: ClipboardEventHandler<Target>;
		onPasteCapture?: ClipboardEventHandler<Target>;

		// Composition Events
		onCompositionEnd?: CompositionEventHandler<Target>;
		onCompositionEndCapture?: CompositionEventHandler<Target>;
		onCompositionStart?: CompositionEventHandler<Target>;
		onCompositionStartCapture?: CompositionEventHandler<Target>;
		onCompositionUpdate?: CompositionEventHandler<Target>;
		onCompositionUpdateCapture?: CompositionEventHandler<Target>;

		// Details Events
		onToggle?: GenericEventHandler<Target>;

		// Focus Events
		onFocus?: FocusEventHandler<Target>;
		onFocusCapture?: FocusEventHandler<Target>;
		onfocusin?: FocusEventHandler<Target>;
		onfocusinCapture?: FocusEventHandler<Target>;
		onfocusout?: FocusEventHandler<Target>;
		onfocusoutCapture?: FocusEventHandler<Target>;
		onBlur?: FocusEventHandler<Target>;
		onBlurCapture?: FocusEventHandler<Target>;

		// Form Events
		onChange?: GenericEventHandler<Target>;
		onChangeCapture?: GenericEventHandler<Target>;
		onInput?: GenericEventHandler<Target>;
		onInputCapture?: GenericEventHandler<Target>;
		onBeforeInput?: GenericEventHandler<Target>;
		onBeforeInputCapture?: GenericEventHandler<Target>;
		onSearch?: GenericEventHandler<Target>;
		onSearchCapture?: GenericEventHandler<Target>;
		onSubmit?: GenericEventHandler<Target>;
		onSubmitCapture?: GenericEventHandler<Target>;
		onInvalid?: GenericEventHandler<Target>;
		onInvalidCapture?: GenericEventHandler<Target>;
		onReset?: GenericEventHandler<Target>;
		onResetCapture?: GenericEventHandler<Target>;
		onFormData?: GenericEventHandler<Target>;
		onFormDataCapture?: GenericEventHandler<Target>;

		// Keyboard Events
		onKeyDown?: KeyboardEventHandler<Target>;
		onKeyDownCapture?: KeyboardEventHandler<Target>;
		onKeyPress?: KeyboardEventHandler<Target>;
		onKeyPressCapture?: KeyboardEventHandler<Target>;
		onKeyUp?: KeyboardEventHandler<Target>;
		onKeyUpCapture?: KeyboardEventHandler<Target>;

		// Media Events
		onAbort?: GenericEventHandler<Target>;
		onAbortCapture?: GenericEventHandler<Target>;
		onCanPlay?: GenericEventHandler<Target>;
		onCanPlayCapture?: GenericEventHandler<Target>;
		onCanPlayThrough?: GenericEventHandler<Target>;
		onCanPlayThroughCapture?: GenericEventHandler<Target>;
		onDurationChange?: GenericEventHandler<Target>;
		onDurationChangeCapture?: GenericEventHandler<Target>;
		onEmptied?: GenericEventHandler<Target>;
		onEmptiedCapture?: GenericEventHandler<Target>;
		onEncrypted?: GenericEventHandler<Target>;
		onEncryptedCapture?: GenericEventHandler<Target>;
		onEnded?: GenericEventHandler<Target>;
		onEndedCapture?: GenericEventHandler<Target>;
		onLoadedData?: GenericEventHandler<Target>;
		onLoadedDataCapture?: GenericEventHandler<Target>;
		onLoadedMetadata?: GenericEventHandler<Target>;
		onLoadedMetadataCapture?: GenericEventHandler<Target>;
		onLoadStart?: GenericEventHandler<Target>;
		onLoadStartCapture?: GenericEventHandler<Target>;
		onPause?: GenericEventHandler<Target>;
		onPauseCapture?: GenericEventHandler<Target>;
		onPlay?: GenericEventHandler<Target>;
		onPlayCapture?: GenericEventHandler<Target>;
		onPlaying?: GenericEventHandler<Target>;
		onPlayingCapture?: GenericEventHandler<Target>;
		onProgress?: GenericEventHandler<Target>;
		onProgressCapture?: GenericEventHandler<Target>;
		onRateChange?: GenericEventHandler<Target>;
		onRateChangeCapture?: GenericEventHandler<Target>;
		onSeeked?: GenericEventHandler<Target>;
		onSeekedCapture?: GenericEventHandler<Target>;
		onSeeking?: GenericEventHandler<Target>;
		onSeekingCapture?: GenericEventHandler<Target>;
		onStalled?: GenericEventHandler<Target>;
		onStalledCapture?: GenericEventHandler<Target>;
		onSuspend?: GenericEventHandler<Target>;
		onSuspendCapture?: GenericEventHandler<Target>;
		onTimeUpdate?: GenericEventHandler<Target>;
		onTimeUpdateCapture?: GenericEventHandler<Target>;
		onVolumeChange?: GenericEventHandler<Target>;
		onVolumeChangeCapture?: GenericEventHandler<Target>;
		onWaiting?: GenericEventHandler<Target>;
		onWaitingCapture?: GenericEventHandler<Target>;

		// MouseEvents
		onClick?: MouseEventHandler<Target>;
		onClickCapture?: MouseEventHandler<Target>;
		onContextMenu?: MouseEventHandler<Target>;
		onContextMenuCapture?: MouseEventHandler<Target>;
		onDblClick?: MouseEventHandler<Target>;
		onDblClickCapture?: MouseEventHandler<Target>;
		onDrag?: DragEventHandler<Target>;
		onDragCapture?: DragEventHandler<Target>;
		onDragEnd?: DragEventHandler<Target>;
		onDragEndCapture?: DragEventHandler<Target>;
		onDragEnter?: DragEventHandler<Target>;
		onDragEnterCapture?: DragEventHandler<Target>;
		onDragExit?: DragEventHandler<Target>;
		onDragExitCapture?: DragEventHandler<Target>;
		onDragLeave?: DragEventHandler<Target>;
		onDragLeaveCapture?: DragEventHandler<Target>;
		onDragOver?: DragEventHandler<Target>;
		onDragOverCapture?: DragEventHandler<Target>;
		onDragStart?: DragEventHandler<Target>;
		onDragStartCapture?: DragEventHandler<Target>;
		onDrop?: DragEventHandler<Target>;
		onDropCapture?: DragEventHandler<Target>;
		onMouseDown?: MouseEventHandler<Target>;
		onMouseDownCapture?: MouseEventHandler<Target>;
		onMouseEnter?: MouseEventHandler<Target>;
		onMouseEnterCapture?: MouseEventHandler<Target>;
		onMouseLeave?: MouseEventHandler<Target>;
		onMouseLeaveCapture?: MouseEventHandler<Target>;
		onMouseMove?: MouseEventHandler<Target>;
		onMouseMoveCapture?: MouseEventHandler<Target>;
		onMouseOut?: MouseEventHandler<Target>;
		onMouseOutCapture?: MouseEventHandler<Target>;
		onMouseOver?: MouseEventHandler<Target>;
		onMouseOverCapture?: MouseEventHandler<Target>;
		onMouseUp?: MouseEventHandler<Target>;
		onMouseUpCapture?: MouseEventHandler<Target>;

		// Selection Events
		onSelect?: GenericEventHandler<Target>;
		onSelectCapture?: GenericEventHandler<Target>;

		// Touch Events
		onTouchCancel?: TouchEventHandler<Target>;
		onTouchCancelCapture?: TouchEventHandler<Target>;
		onTouchEnd?: TouchEventHandler<Target>;
		onTouchEndCapture?: TouchEventHandler<Target>;
		onTouchMove?: TouchEventHandler<Target>;
		onTouchMoveCapture?: TouchEventHandler<Target>;
		onTouchStart?: TouchEventHandler<Target>;
		onTouchStartCapture?: TouchEventHandler<Target>;

		// Pointer Events
		onPointerOver?: PointerEventHandler<Target>;
		onPointerOverCapture?: PointerEventHandler<Target>;
		onPointerEnter?: PointerEventHandler<Target>;
		onPointerEnterCapture?: PointerEventHandler<Target>;
		onPointerDown?: PointerEventHandler<Target>;
		onPointerDownCapture?: PointerEventHandler<Target>;
		onPointerMove?: PointerEventHandler<Target>;
		onPointerMoveCapture?: PointerEventHandler<Target>;
		onPointerUp?: PointerEventHandler<Target>;
		onPointerUpCapture?: PointerEventHandler<Target>;
		onPointerCancel?: PointerEventHandler<Target>;
		onPointerCancelCapture?: PointerEventHandler<Target>;
		onPointerOut?: PointerEventHandler<Target>;
		onPointerOutCapture?: PointerEventHandler<Target>;
		onPointerLeave?: PointerEventHandler<Target>;
		onPointerLeaveCapture?: PointerEventHandler<Target>;
		onGotPointerCapture?: PointerEventHandler<Target>;
		onGotPointerCaptureCapture?: PointerEventHandler<Target>;
		onLostPointerCapture?: PointerEventHandler<Target>;
		onLostPointerCaptureCapture?: PointerEventHandler<Target>;

		// UI Events
		onScroll?: UIEventHandler<Target>;
		onScrollCapture?: UIEventHandler<Target>;

		// Wheel Events
		onWheel?: WheelEventHandler<Target>;
		onWheelCapture?: WheelEventHandler<Target>;

		// Animation Events
		onAnimationStart?: AnimationEventHandler<Target>;
		onAnimationStartCapture?: AnimationEventHandler<Target>;
		onAnimationEnd?: AnimationEventHandler<Target>;
		onAnimationEndCapture?: AnimationEventHandler<Target>;
		onAnimationIteration?: AnimationEventHandler<Target>;
		onAnimationIterationCapture?: AnimationEventHandler<Target>;

		// Transition Events
		onTransitionEnd?: TransitionEventHandler<Target>;
		onTransitionEndCapture?: TransitionEventHandler<Target>;
	}

	export interface HTMLAttributes<RefType extends EventTarget = EventTarget> extends DOMAttributes<RefType> {
		// Custom attributes, not sure why TypeScript didn't pick these up on the IntrinsicAttributes type
		key?: string;
		// ref?: string;
		children?: any;
		// Standard HTML Attributes
		accept?: string;
		acceptCharset?: string;
		accessKey?: string;
		action?: string;
		allow?: string;
		allowFullScreen?: boolean;
		allowTransparency?: boolean;
		alt?: string;
		as?: string;
		async?: boolean;
		autocomplete?: string;
		autoComplete?: string;
		autocorrect?: string;
		autoCorrect?: string;
		autofocus?: boolean;
		autoFocus?: boolean;
		autoPlay?: boolean;
		capture?: boolean | string;
		cellPadding?: number | string;
		cellSpacing?: number | string;
		charSet?: string;
		challenge?: string;
		checked?: boolean;
		cite?: string;
		class?: string | undefined;
		className?: string | undefined;
		cols?: number;
		colSpan?: number;
		content?: string;
		contentEditable?: boolean;
		contextMenu?: string;
		controls?: boolean;
		controlsList?: string;
		coords?: string;
		crossOrigin?: string;
		data?: string;
		dateTime?: string;
		default?: boolean;
		defaultChecked?: boolean;
		defaultValue?: string;
		defer?: boolean;
		dir?: 'auto' | 'rtl' | 'ltr';
		disabled?: boolean;
		disableRemotePlayback?: boolean;
		download?: any;
		decoding?:
			| 'sync'
			| 'async'
			| 'auto';
		draggable?: boolean;
		encType?: string;
		enterkeyhint?:
			| 'enter'
			| 'done'
			| 'go'
			| 'next'
			| 'previous'
			| 'search'
			| 'send';
		form?: string;
		formAction?: string;
		formEncType?: string;
		formMethod?: string;
		formNoValidate?: boolean;
		formTarget?: string;
		frameBorder?: number | string;
		headers?: string;
		height?: number | string;
		hidden?: boolean;
		high?: number;
		href?: string;
		hrefLang?: string;
		for?: string;
		htmlFor?: string;
		httpEquiv?: string;
		icon?: string;
		id?: string;
		inputMode?: string;
		integrity?: string;
		is?: string;
		keyParams?: string;
		keyType?: string;
		kind?: string;
		label?: string;
		lang?: string;
		list?: string;
		loading?: 'eager' | 'lazy';
		loop?: boolean;
		low?: number;
		manifest?: string;
		marginHeight?: number;
		marginWidth?: number;
		max?: number | string;
		maxLength?: number;
		media?: string;
		mediaGroup?: string;
		method?: string;
		min?: number | string;
		minLength?: number;
		multiple?: boolean;
		muted?: boolean;
		name?: string;
		nomodule?: boolean;
		nonce?: string;
		noValidate?: boolean;
		open?: boolean;
		optimum?: number;
		part?: string;
		pattern?: string;
		ping?: string;
		placeholder?: string;
		playsInline?: boolean;
		poster?: string;
		preload?: string;
		radioGroup?: string;
		readonly?: boolean;
		readOnly?: boolean;
		referrerpolicy?:
			| 'no-referrer'
			| 'no-referrer-when-downgrade'
			| 'origin'
			| 'origin-when-cross-origin'
			| 'same-origin'
			| 'strict-origin'
			| 'strict-origin-when-cross-origin'
			| 'unsafe-url';
		rel?: string;
		required?: boolean;
		reversed?: boolean;
		role?: string;
		rows?: number;
		rowSpan?: number;
		sandbox?: string;
		scope?: string;
		scoped?: boolean;
		scrolling?: string;
		seamless?: boolean;
		selected?: boolean;
		shape?: string;
		size?: number;
		sizes?: string;
		slot?: string;
		span?: number;
		spellcheck?: boolean;
		spellCheck?: boolean;
		src?: string;
		srcset?: string;
		srcDoc?: string;
		srcLang?: string;
		srcSet?: string;
		start?: number;
		step?: number | string;
		style?: string | CSSProperties;
		summary?: string;
		tabIndex?: number;
		target?: string;
		title?: string;
		type?: string;
		useMap?: string;
		value?: string | string[] | number;
		volume?: string | number;
		width?: number | string;
		wmode?: string;
		wrap?: string;

		// Non-standard Attributes
		autocapitalize?:
			| 'off'
			| 'none'
			| 'on'
			| 'sentences'
			| 'words'
			| 'characters';
		autoCapitalize?:
			| 'off'
			| 'none'
			| 'on'
			| 'sentences'
			| 'words'
			| 'characters';
		disablePictureInPicture?: boolean;
		results?: number;
		translate?: 'yes' | 'no';

		// RDFa Attributes
		about?: string;
		datatype?: string;
		inlist?: any;
		prefix?: string;
		property?: string;
		resource?: string;
		typeof?: string;
		vocab?: string;

		// Microdata Attributes
		itemProp?: string;
		itemScope?: boolean;
		itemType?: string;
		itemID?: string;
		itemRef?: string;
	}

	export type DetailedHTMLProps<
		HA extends HTMLAttributes<RefType>,
		RefType extends EventTarget = EventTarget
	> = HA;

	export interface HTMLMarqueeElement extends HTMLElement {
		behavior?:
			| 'scroll'
			| 'slide'
			| 'alternate';
		bgColor?: string;
		direction?:
			| 'left'
			| 'right'
			| 'up'
			| 'down';
		height?: number | string;
		hspace?: number | string;
		loop?: number | string;
		scrollAmount?: number | string;
		scrollDelay?: number | string;
		trueSpeed?: boolean;
		vspace?: number | string;
		width?: number | string;
	}

	export interface IntrinsicElements {
		// HTML
		a: HTMLAttributes<HTMLAnchorElement>;
		abbr: HTMLAttributes<HTMLElement>;
		address: HTMLAttributes<HTMLElement>;
		area: HTMLAttributes<HTMLAreaElement>;
		article: HTMLAttributes<HTMLElement>;
		aside: HTMLAttributes<HTMLElement>;
		audio: HTMLAttributes<HTMLAudioElement>;
		b: HTMLAttributes<HTMLElement>;
		base: HTMLAttributes<HTMLBaseElement>;
		bdi: HTMLAttributes<HTMLElement>;
		bdo: HTMLAttributes<HTMLElement>;
		big: HTMLAttributes<HTMLElement>;
		blockquote: HTMLAttributes<HTMLQuoteElement>;
		body: HTMLAttributes<HTMLBodyElement>;
		br: HTMLAttributes<HTMLBRElement>;
		button: HTMLAttributes<HTMLButtonElement>;
		canvas: HTMLAttributes<HTMLCanvasElement>;
		caption: HTMLAttributes<HTMLTableCaptionElement>;
		cite: HTMLAttributes<HTMLElement>;
		code: HTMLAttributes<HTMLElement>;
		col: HTMLAttributes<HTMLTableColElement>;
		colgroup: HTMLAttributes<HTMLTableColElement>;
		data: HTMLAttributes<HTMLDataElement>;
		datalist: HTMLAttributes<HTMLDataListElement>;
		dd: HTMLAttributes<HTMLElement>;
		del: HTMLAttributes<HTMLModElement>;
		details: HTMLAttributes<HTMLDetailsElement>;
		dfn: HTMLAttributes<HTMLElement>;
		dialog: HTMLAttributes<HTMLDialogElement>;
		div: HTMLAttributes<HTMLDivElement>;
		dl: HTMLAttributes<HTMLDListElement>;
		dt: HTMLAttributes<HTMLElement>;
		em: HTMLAttributes<HTMLElement>;
		embed: HTMLAttributes<HTMLEmbedElement>;
		fieldset: HTMLAttributes<HTMLFieldSetElement>;
		figcaption: HTMLAttributes<HTMLElement>;
		figure: HTMLAttributes<HTMLElement>;
		footer: HTMLAttributes<HTMLElement>;
		form: HTMLAttributes<HTMLFormElement>;
		h1: HTMLAttributes<HTMLHeadingElement>;
		h2: HTMLAttributes<HTMLHeadingElement>;
		h3: HTMLAttributes<HTMLHeadingElement>;
		h4: HTMLAttributes<HTMLHeadingElement>;
		h5: HTMLAttributes<HTMLHeadingElement>;
		h6: HTMLAttributes<HTMLHeadingElement>;
		head: HTMLAttributes<HTMLHeadElement>;
		header: HTMLAttributes<HTMLElement>;
		hgroup: HTMLAttributes<HTMLElement>;
		hr: HTMLAttributes<HTMLHRElement>;
		html: HTMLAttributes<HTMLHtmlElement>;
		i: HTMLAttributes<HTMLElement>;
		iframe: HTMLAttributes<HTMLIFrameElement>;
		img: HTMLAttributes<HTMLImageElement>;
		input: HTMLAttributes<HTMLInputElement>;
		ins: HTMLAttributes<HTMLModElement>;
		kbd: HTMLAttributes<HTMLElement>;
		keygen: HTMLAttributes<HTMLUnknownElement>;
		label: HTMLAttributes<HTMLLabelElement>;
		legend: HTMLAttributes<HTMLLegendElement>;
		li: HTMLAttributes<HTMLLIElement>;
		link: HTMLAttributes<HTMLLinkElement>;
		main: HTMLAttributes<HTMLElement>;
		map: HTMLAttributes<HTMLMapElement>;
		mark: HTMLAttributes<HTMLElement>;
		marquee: HTMLAttributes<HTMLMarqueeElement>;
		menu: HTMLAttributes<HTMLMenuElement>;
		menuitem: HTMLAttributes<HTMLUnknownElement>;
		meta: HTMLAttributes<HTMLMetaElement>;
		meter: HTMLAttributes<HTMLMeterElement>;
		nav: HTMLAttributes<HTMLElement>;
		noscript: HTMLAttributes<HTMLElement>;
		object: HTMLAttributes<HTMLObjectElement>;
		ol: HTMLAttributes<HTMLOListElement>;
		optgroup: HTMLAttributes<HTMLOptGroupElement>;
		option: HTMLAttributes<HTMLOptionElement>;
		output: HTMLAttributes<HTMLOutputElement>;
		p: HTMLAttributes<HTMLParagraphElement>;
		param: HTMLAttributes<HTMLParamElement>;
		picture: HTMLAttributes<HTMLPictureElement>;
		pre: HTMLAttributes<HTMLPreElement>;
		progress: HTMLAttributes<HTMLProgressElement>;
		q: HTMLAttributes<HTMLQuoteElement>;
		rp: HTMLAttributes<HTMLElement>;
		rt: HTMLAttributes<HTMLElement>;
		ruby: HTMLAttributes<HTMLElement>;
		s: HTMLAttributes<HTMLElement>;
		samp: HTMLAttributes<HTMLElement>;
		script: HTMLAttributes<HTMLScriptElement>;
		section: HTMLAttributes<HTMLElement>;
		select: HTMLAttributes<HTMLSelectElement>;
		slot: HTMLAttributes<HTMLSlotElement>;
		small: HTMLAttributes<HTMLElement>;
		source: HTMLAttributes<HTMLSourceElement>;
		span: HTMLAttributes<HTMLSpanElement>;
		strong: HTMLAttributes<HTMLElement>;
		style: HTMLAttributes<HTMLStyleElement>;
		sub: HTMLAttributes<HTMLElement>;
		summary: HTMLAttributes<HTMLElement>;
		sup: HTMLAttributes<HTMLElement>;
		table: HTMLAttributes<HTMLTableElement>;
		tbody: HTMLAttributes<HTMLTableSectionElement>;
		td: HTMLAttributes<HTMLTableCellElement>;
		textarea: HTMLAttributes<HTMLTextAreaElement>;
		tfoot: HTMLAttributes<HTMLTableSectionElement>;
		th: HTMLAttributes<HTMLTableCellElement>;
		thead: HTMLAttributes<HTMLTableSectionElement>;
		time: HTMLAttributes<HTMLTimeElement>;
		title: HTMLAttributes<HTMLTitleElement>;
		tr: HTMLAttributes<HTMLTableRowElement>;
		track: HTMLAttributes<HTMLTrackElement>;
		u: HTMLAttributes<HTMLElement>;
		ul: HTMLAttributes<HTMLUListElement>;
		var: HTMLAttributes<HTMLElement>;
		video: HTMLAttributes<HTMLVideoElement>;
		wbr: HTMLAttributes<HTMLElement>;

		//SVG
		svg: SVGAttributes<SVGSVGElement>;
		animate: SVGAttributes<SVGAnimateElement>;
		circle: SVGAttributes<SVGCircleElement>;
		animateTransform: SVGAttributes<SVGAnimateElement>;
		clipPath: SVGAttributes<SVGClipPathElement>;
		defs: SVGAttributes<SVGDefsElement>;
		desc: SVGAttributes<SVGDescElement>;
		ellipse: SVGAttributes<SVGEllipseElement>;
		feBlend: SVGAttributes<SVGFEBlendElement>;
		feColorMatrix: SVGAttributes<SVGFEColorMatrixElement>;
		feComponentTransfer: SVGAttributes<SVGFEComponentTransferElement>;
		feComposite: SVGAttributes<SVGFECompositeElement>;
		feConvolveMatrix: SVGAttributes<SVGFEConvolveMatrixElement>;
		feDiffuseLighting: SVGAttributes<SVGFEDiffuseLightingElement>;
		feDisplacementMap: SVGAttributes<SVGFEDisplacementMapElement>;
		feDropShadow: SVGAttributes<SVGFEDropShadowElement>;
		feFlood: SVGAttributes<SVGFEFloodElement>;
		feFuncA: SVGAttributes<SVGFEFuncAElement>;
		feFuncB: SVGAttributes<SVGFEFuncBElement>;
		feFuncG: SVGAttributes<SVGFEFuncGElement>;
		feFuncR: SVGAttributes<SVGFEFuncRElement>;
		feGaussianBlur: SVGAttributes<SVGFEGaussianBlurElement>;
		feImage: SVGAttributes<SVGFEImageElement>;
		feMerge: SVGAttributes<SVGFEMergeElement>;
		feMergeNode: SVGAttributes<SVGFEMergeNodeElement>;
		feMorphology: SVGAttributes<SVGFEMorphologyElement>;
		feOffset: SVGAttributes<SVGFEOffsetElement>;
		feSpecularLighting: SVGAttributes<SVGFESpecularLightingElement>;
		feTile: SVGAttributes<SVGFETileElement>;
		feTurbulence: SVGAttributes<SVGFETurbulenceElement>;
		filter: SVGAttributes<SVGFilterElement>;
		foreignObject: SVGAttributes<SVGForeignObjectElement>;
		g: SVGAttributes<SVGGElement>;
		image: SVGAttributes<SVGImageElement>;
		line: SVGAttributes<SVGLineElement>;
		linearGradient: SVGAttributes<SVGLinearGradientElement>;
		marker: SVGAttributes<SVGMarkerElement>;
		mask: SVGAttributes<SVGMaskElement>;
		path: SVGAttributes<SVGPathElement>;
		pattern: SVGAttributes<SVGPatternElement>;
		polygon: SVGAttributes<SVGPolygonElement>;
		polyline: SVGAttributes<SVGPolylineElement>;
		radialGradient: SVGAttributes<SVGRadialGradientElement>;
		rect: SVGAttributes<SVGRectElement>;
		stop: SVGAttributes<SVGStopElement>;
		symbol: SVGAttributes<SVGSymbolElement>;
		text: SVGAttributes<SVGTextElement>;
		textPath: SVGAttributes<SVGTextPathElement>;
		tspan: SVGAttributes<SVGTSpanElement>;
		use: SVGAttributes<SVGUseElement>;
	}
}
