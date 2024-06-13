$.fn.select2.amd.define('optgroup/data', [], function () {
	return class {
		current(decorated, callback) {
			var self = this;
			decorated.call(this, (data) => {
				this.$element.find('optgroup').each(function () {
					var $option = $(this);
					var option = self.item($option);
					let childs = option.children;
					// every() is true when empty, so make sure it's not
					if (!childs || childs.length == 0) {
							return;
					}
					//option.selected = childs.every((e) => e.selected)
					option.selected = (function childsSelected(childs) {
						return childs.every((e) => e.children ? childsSelected(e.children) : e.selected);
					})(childs);
					if (option.selected)
					{
						data.push(option);
						childs.forEach(child => data.push());
					}
				});
				callback(data);
			});
			return;
		}
	
		_toggleGroup(_, data, selected) {
			if (data.children) {
				data.selected = selected; // change state of group and all its children
				data.children.forEach((child) => {
					if(child.selected != selected) {
						this.trigger((selected) ? 'select' : 'unselect', {
							originalEvent: null,
							data: child
						});
					}
					child.selected = selected;
					if (child.element != null && child.element.tagName.toLowerCase() === 'option') {
						child.element.selected = selected; // so current() can filter <option> elements by :checked
					}
				  this._toggleGroup(child, selected);
				});
				this.$element.trigger('change');
			}
		}

		bind(decorated, container, $container) {
			decorated.call(this, container, $container);
			var self = this;
			this.$element.on('select2:select select2:unselect', function (e) {
				if(!self.options.get('propagateOptgroupSelectEvents') && e.params.data.children) {
					// stop select event propagation for groups
					e.stopImmediatePropagation();
				}
			});
		}
	
		select(decorated, data) {
			if (data.children) {
				this._toggleGroup(data, true);
			}
			return decorated.call(this, data);
		}

		unselect(decorated, data) {
			if (data.children) {
				this._toggleGroup(data, false);
			}
			return decorated.call(this, data);
		}
		};
});

$.fn.select2.amd.define('optgroup/results', [], function () {
	return class {
		option(decorated, data) {
			if (data.id == null && data.children && data.element) {
				// let's follow the html5 id naming convention and replace whitespaces
				// we have to give the group element an id to mark them as selected for setClasses
				data.id = data.text.replace(/\s/g,'_');
				//data = this.data._normalizeItem(data); // creates a _resultId but is overwritten anyway
			}
			var option = decorated.call(this, data);

			if (data.children && data.element) {
				$(option).children('.select2-results__group')
					// mapping clickable label to the optgroup elements data (see Utils.GetData->Utils.GetUniqueElementId)
					.attr("data-select2-id", data.element.getAttribute('data-select2-id'))
					.addClass('select2-results__option--selectable select2-results__option')
					// make it behave like an option. we don't want to include a css file just for that
					.css({display: "block"});
			}

			return option;
		}

		setClasses(decorated, container, $container) {
			// calls data.current to get selected options and applies css styles based on select state
			var data = this.data;
			var options = [];
			this.$results.find(".select2-results__group").each((_, result) => {
				let item = data.item($(result));
				if (item.children) {
					options.push([item, item.element]);
					item.element = null;
					// bypassing the null check for the selected class change
					// (item.element == null && selectedIds.indexOf(id) > -1))
				}
			  })

			decorated.call(this, container, $container);
			for(let [item, element] of options) {
				item.element = element; // restore the old element
			};
			return;
		};
	};
});

$.fn.select2.amd.define('optgroup/selection', [], function () {
	return class {
		update(decorated, data) {
			if (this.options.get('groupResults')) {
				// delete children and keep the group label
				for(const optgroup of data.filter(item => item.children)) {
					data = data.filter(item => !optgroup.children.includes(item));
				}
			} else {
				// remove all group labels
				data = data.filter(item => !item.children);
			}
			decorated.call(this, data);
		}
	};
});

// Polyfill for multiple decorators https://github.com/select2/select2/pull/6309
$.fn.select2.amd.require(['select2/defaults', "select2/utils", 'optgroup/data', 'optgroup/results', 'optgroup/selection'],
	function (Defaults, Utils, data, results, selection) {
		let __super__apply = Defaults.apply.bind(Defaults);
		const adapterFields = Object.entries(__super__apply({})).reduce((pV,[k,v]) => {
			//if (v.name === 'DecoratedClass' || v.__super__) { // doesn't work in minified version
			if(v.prototype && v.prototype.bind) {
				pV.push(k);
			}
			return pV;
		}, 
		[]);

		Defaults.apply = function(options) {
			const opt = __super__apply(options);
			if(options.selectableOptgroup) {
				opt.dataAdapter = Utils.Decorate(opt.dataAdapter, data);
				opt.resultsAdapter = Utils.Decorate(opt.resultsAdapter, results);
				opt.selectionAdapter = Utils.Decorate(opt.selectionAdapter, selection);

				if(!opt.hasOwnProperty('groupResults'))
				{
					// setting groupResults to true as default when groupResults is not defined
					opt.groupResults = true;
				}
			}

			for(const adapter of adapterFields) { 
				const decorators = options[adapter + 'Decorators'];
				if(decorators instanceof Array)
				{
					for(const decorator of decorators) {
						opt[adapter] = Utils.Decorate(opt[adapter], decorator);
					}
				}
			}
			return opt;
		}

		// Polyfill for js class decorator support, where prototype methods are not enumerable by default
		let __super__Decorate = Utils.Decorate.bind(Defaults);
		Utils.Decorate = function (SuperClass, DecoratorClass, proto = DecoratorClass.prototype) {
			Object.getOwnPropertyNames( proto ).forEach((prop) => 
				Object.defineProperty(proto, prop, {enumerable: true})
			);
			return __super__Decorate(SuperClass, DecoratorClass);
		}
	}, null, true // forceSync = true for immediate execution since all dependencies have been defined already
);

// $.fn.select2.amd.require(['select2/selection/multiple', 'select2/selection/single'],
// 	function (MultipleSelection, SingleSelection) {
// 		MultipleSelection.prototype.display = 
// 		SingleSelection.prototype.display = function (data, container) {
// 			var template = this.options.get('templateSelection');
// 			var escapeMarkup = this.options.get('escapeMarkup');

// 			var content = template(data, container);
// 			if (typeof content === 'string' || content instanceof String)
// 				content = escapeMarkup(content);
// 			return content;
// 		}
// }, null, true);

// Polyfill for bugfix https://github.com/select2/select2/pull/6310
$.fn.select2.amd.require(['select2/data/array'],
	function (ArrayAdapter) {
		let __super__convertToOptions = ArrayAdapter.prototype.convertToOptions;
		ArrayAdapter.prototype.convertToOptions = function (data) {
			var self = this;

			const $options = __super__convertToOptions.call(this, data);
			for(const $option of $options) {
				(function applyChildData(option) {
					if (option.children) {
						option.children.forEach(function(child, index, children) {
							var $child = $($(option.element).children()[index]);
							// creating a normalized data cache for all recursive optgroup children
							// fixes a bug, where ArrayAdapter.prototype.select can't bind options because id is not normalized to a string
							// therefore it tries to recreate duplicates of the option with addOptions and the passed option data does not contain an element link
							children[index] = self.item($child);
							applyChildData(children[index]);
						});
					}
				})(self.item($option));
			}
			return $options;
		}

		ArrayAdapter.prototype.select = function (data) {
			// return elm.value == data.id.toString();
			// the super func is only looking for <option> and ignores optgroups
			// now that data is correctly bound, checking for element has the same effect and includes optgroups
			if (!data.element) {
				this.addOptions(this.option(data));
			}
	
			ArrayAdapter.__super__.select.call(this, data);
		};
	}, null, true);