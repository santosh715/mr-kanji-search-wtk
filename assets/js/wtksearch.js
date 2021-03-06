class WTKSearch {
  searchBarId              = 'searchBar';
  checkboxStrictQuery      = 'input[name=strictModeCheckbox]';
  checkboxRTKQuery         = 'input[name=rtkModeCheckbox]';
  checkboxStrictLabelQuery = '#strictModeLabel';
  checkboxVocabQuery       = 'input[name=vocabModeCheckbox'; // also called compound mode
  vocabInputQuery          = 'vocabInput';
  vocabCopyButtonQuery     = 'cbCopyButtonVocab';
  deleteVocabButtonQuery   = 'deleteVocabButton';
  versionElementQuery      = 'wtkVersionFooterElement';
  copyButtonsHighlighted   = {};
  copyButtonSelectedClass  = 'btnClipLastSelected';
  maxResultSize            = 50;
  lastQuery                = '';
  //lastQueries            = []; // currently unused
  lastStrict               = false;
  lastRTK                  = false;
  logLevel                 = 0; // silent by default
  rtkMode                  = false; // save isRtkMode() for a while so it doesn't have to be called every time
  strictMode               = false;
  result                   = null; // save $('#search-results')
  entries                  = null; // save $('#search-results .entries')

  searchBarSearch() {
    let query = document.getElementById(this.searchBarId).value;
    this.search(query, {
      returnResults: false,
      forceSearch: false,
      updateHTMLElements: true
    });
  }

  /** Search for kanji using Wanikani or RTK names for elements/Kanji.
   * 
   * @param {string} query a search query (string), using Wanikani radicals or RTK names (elements/primitives/kanji names) 
   * @param {boolean} returnResults whether the return value of this function should contain the length and
   * @param {boolean} forceSearch whether to force executing the search, or, if false, cancel the search if it was searched before, the query is too short etc.
   * @param {boolean} updateHTMLElements whether to update
   * @returns {Object} object with the properties:
   *  length: number of results
   *  list: ordered list of results. the first one is the top one on the website.
   *  $kanji: $page
   *   where the page for each page has the properties id, kanji (same as $kanji), keyword,
   *   keywordWK (optional), elements, elementsWK (optional).
   *   If !returnResults, only the length property will be included in the returned object.
   */
  search(query, {
    returnResults = true,
    forceSearch = true,
    updateHTMLElements = false
  } = {}) {
    if (!query?.trim) {
      return { length: 0 };
    }
    query = query.trim().toLowerCase();
    // trim is useful for mobile auto-correct. maybe check later if input like 'inX' is necessary
    var result  = this.result  = $('#search-results');
    var entries = this.entries = $('#search-results .entries');
    const rtkMode = this.rtkMode = this.isRtkMode(); // used multiple times
    const strictMode = this.strictMode = !rtkMode && this.isStrictMode(); // TODO fix strict mode for rtk mode, currently disabled in rtk mode.

    const kanjiMatch = query.match(/[\u4e00-\u9faf\u3400-\u4dbf]/); // kanji, or CJK chinese-japanese unified ideograph/symbol
    // TODO filter chinese kanji that aren't used in japanese and display a message that it's chinese
    if (kanjiMatch && kanjiMatch[0]) {
      return this.searchByKanji(kanjiMatch[0], {
        updateHTMLElements: updateHTMLElements
      });
    }

    if (!forceSearch && query === this.lastQuery && strictMode === this.lastStrict && rtkMode === this.lastRTK) {
      return { length: 0 };
    }
    this.lastQuery = query; // also needs to be applied if query.length <= 2, e.g. inx -> in -> inx
    this.lastStrict = strictMode;
    this.lastRTK    = rtkMode;
    
    const isSmallRtkKeyword = rtkMode && this.is_short_rtk_keyword(query);
    const isSmallWkKeyword = !rtkMode && this.is_short_wk_keyword(query);
    if (!forceSearch && query.length <= 2 && !(isSmallRtkKeyword || isSmallWkKeyword)) {
      result.hide();
      entries.empty();
      return { length: 0 };
    }
    //this.lastQueries.push(query);
    //if (this.lastQueries.length > 5) {
      // TODO do something with lastQueries, maybe push limit to 10 or so
      //this.lastQueries.shift(); // remove oldest query
    //}

    // replace spaces in WK radical names
    const space_replacements = this.get_space_replacements();
    if (!rtkMode) { // only do pre-replacements in WK mode
      for (let [key, value] of Object.entries(space_replacements)) {
        query = query.replace(key, value);
      }
    }

    // mapping from WK radicals to RTK elements. (format of the values is comma separated, no spaces between values)
    // WK radical input should be without spaces inside radicals, so "ricepaddy" instead of "rice paddy".
    
    let rtkQueries = [];
    let outputRadicals = [];
    let inputRadicals = [];
    if (!rtkMode) {
      const wk_replacements = this.get_wk_to_rtk_replacements();
      rtkQueries.push(''); // necessary for now - investigate
      inputRadicals = query.split(' ');

      // create queries with each alternate RTK replacement (e.g. ricepaddy can be rice field, silage or sun)
      //   TODO the current method is crude and could be improved, but works for now.
      for (const inputRadical of inputRadicals) {
        if (inputRadical === '') { // can also happen for "blue     sun" for example, which won't be trimmed
          continue;
        }
        const radical = inputRadical.toLowerCase();
        if (wk_replacements[radical]) { // this is a WK radical that needs to be replaced
          const rtkVersions = wk_replacements[radical].split(',');
          const rtkKeywordLists = this.getRtkKeywordLists(rtkVersions);
          if (rtkKeywordLists.length === 1) {
            // if we only have one possible replacement, just add it to each query
            for (let i=0; i<rtkQueries.length; i++) {
              for (const keywordList of rtkKeywordLists) {
                for (const keyword of keywordList) {
                  rtkQueries[i] += keyword + ' ';
                  outputRadicals.push(keyword);
                }
              }
            }
          } else { // we have multiple possible rtk equaivalents
            const queryLength = rtkQueries.length; // necessary to not make for loop infinitely
            // create a new query for every possible replacement of the inputRadical
            let newQueries = [];
            for (let i=0; i<queryLength; i++) {
              const rtkQuery = rtkQueries[i];
              for (const keywordList of rtkKeywordLists) {
                // for each keywordList (list of keywords that can replace one WK radical), create a new query
                let newQuery = rtkQuery;
                for (const keyword of keywordList) {
                  newQuery += keyword + ' ';
                  outputRadicals.push(keyword);
                }
                newQueries.push(newQuery);
              }
            }
            rtkQueries = newQueries;
          }
        } else {
          // inputRadical doesn't need to be replaced, just add it to each query
          for (let i=0; i<rtkQueries.length; i++) {
            rtkQueries[i] += inputRadical + ' ';
            outputRadicals.push(inputRadical);
          }
        }
      }
      // our rtkQueries are finished
      // end if(!checkboxRTK.checked)
    } else {
      rtkQueries.push(query);
    }

    this.log(this.LogLevels.Info, ' '); // new line
    //var displayEntries = [];
    // if (query.trim().length <= 2) {
      result.hide();
      entries.empty();
    // }

    let idsAddedToResults = {};
    let searchResults = {
      length: 0,
      list: [],
    };
    // search for each rtkQuery
    for (let i=0; i<rtkQueries.length; i++) {
      let query = rtkQueries[i];
      query = query.trim(); // maybe do that above, but for now don't restrict queries by length too much
      this.log(this.LogLevels.Info, 'query ' + (i+1) + ': ' + query);

      // retrieve matching result with content
      var results = $.map(idx.search(query), function(result) {
        return $.grep(docs, function(entry) {
          // TODO handle multiple queries here instead of the query adding below
          if (entry.id === result.ref && !idsAddedToResults[entry.id]) {
            idsAddedToResults[entry.id] = 1; // id was added. use object=hash map instead of array for O(1) performance
            return true;
          }
          return false;
        })[0];
      });

      //entries.empty();

      let matches = 0;
      let entriesAdded = 0;
      if (results && results.length > 0) {
        // TODO fix strictMode for RTK mode, need to get each radical (e.g. "pent in" would be detected as 2 currently);
        //$.each(results, function(key, page) {
        for (const page of results) {
          let addToResults = !strictMode; // if not strict mode, add all results to query
          const keywordLower = page.keyword.toLowerCase();
          let keywordWKLower = page.keywordWK?.toLowerCase();
          if (!rtkMode && wk_kanji && wk_kanji[page.kanji]) {
            keywordWKLower = wk_kanji[page.kanji].meanings[0].meaning.toLowerCase();
          }
          if (strictMode) {
            const elements = page.elements.split(',').map((val,_,__) => val.trim().toLowerCase());
            const elementsWK = page.elementsWK?.split('.').map((val,_,__) => val.trim());
            for (const outputRadical of outputRadicals) {
              const trimmedRadical = outputRadical.trim().toLowerCase();
              if (trimmedRadical !== '' && (
                    elements.includes(trimmedRadical) ||
                    !rtkMode && elementsWK?.includes(trimmedRadical) ||
                    // trimmedRadical === page.keyword || // probably too lenient for multiple radicals. for exact keyword hit, query covers it
                    // trimmedRadical === page.keywordWK ||
                    query === keywordLower ||
                    query === keywordWKLower
                  )
              ) {
                // in strict mode, only add result if it has at least one element match.
                // we could be even stricter and check that all elements match, but that rarely makes a difference,
                //   and costs quite a bit of performance and refactoring. see feat/stricterMode branch
                addToResults = true;
                matches++;
                break;
              }
            }
          }
          if (addToResults) {
            searchResults.length = searchResults.length + 1;
            if (returnResults) {
              searchResults[page.kanji] = page;
            }

            // prepend the result to the list of results if keyword match, otherwise append
            const keywordLower = page.keyword.toLowerCase();
            let prepend = false;
            if (rtkMode && keywordLower === query ||
              !rtkMode && (outputRadicals.includes(keywordLower) ||
              inputRadicals.includes(keywordLower))
            ) {
               prepend = true
            }
            if (returnResults) {
              if (prepend) {
                searchResults.list.unshift(page);
              } else {
                searchResults.list.push(page);
              }
            }

            if (!updateHTMLElements || entriesAdded >= this.maxResultSize) {
              // performance: don't add more than maxResultSize (50) matches (divs) to entries 
              continue;
            }
            const newEntry = this.createEntry(page);
            if (prepend) {
              entries.prepend(newEntry);
            } else {
              entries.append(newEntry);
            }
            this.addCopyFunctionToEntry(page);
            entriesAdded++;
          }
      } // end for each page
      if (!strictMode) {
        matches = results.length;
      }
    } // end for query
    const maxResultsReachedString = ' (only showing ' + this.maxResultSize + ')';
    this.log(this.LogLevels.Info,
      '  matches: ' + matches + (entriesAdded === this.maxResultSize ? maxResultsReachedString : ''));
      // indent under query
    }
    const elementsNames = rtkMode ? 'elements' : 'radicals';
    if (searchResults.length === 0 && updateHTMLElements) {
      entries.append(
        '<h3><i> No results found. (typo? try other '+elementsNames+'?)</i></h3>'
      );
      let mailSubjectString = '[wtksearch] My Search had no results'.replace(' ', '%20');
      let mailBodyString = 'Hello,\n\nunfortunately my query did not find the kanji i was looking for.\n\n'+
      'Query: ' + query + '\n' +
      'Kanji: ' + '\n' +
      'Version: ' + document.getElementById(this.versionElementQuery).text + '\n' +
      '\n[Please add the kanji you were looking for above, if you can find it elsewhere, or an image of it]\n' +
      '\n';
      mailBodyString = mailBodyString.replace(' ', '%20').replaceAll('\n', '%0A');
      this.entries.append(
        '<h4><a class="h4link" ' +
        'href="mailto:wtksearch@gmail.com?subject=' + mailSubjectString + '&body=' + mailBodyString +
        '">Report missing Kanji in a mail (using template)? ^.^</a> ' +
        '<a class="h4link" href="mailto:wtksearch@gmail.com">wtksearch@gmail.com</a>' +
        '</h4>'
      )
    }
    // if (results.length == 0) {
    //   entries.append('<h4>Kanji not found :-(</h4>'); // sometimes fires too early
    // }
    result.show();

    return searchResults;
  }

  createEntry(page) {
    let kanjiName = page.keyword;
    // this.rtkMode needs to have been saved before, otherwise use !this.rtkMode()
    if (!this.rtkMode && page.keywordWK && page.keywordWK.length > 0) {
      kanjiName = page.keywordWK; // maybe lower case for consistency and principle, but this makes clear it's the WK name
    }
    let wkButtonTextDecoration = '';
    let wkButtonClass = 'btnWK';
    let resultKanjiButtonClass = 'btnResultKanji';
    let wkButtonHoverText = 'View this kanji on wanikani.com';
    if (wk_kanji && wk_kanji[page.kanji]) {
      if (!this.rtkMode) { // wk mode
        kanjiName = wk_kanji[page.kanji].meanings[0].meaning;
        //resultKanjiButtonClass = 'btnResultKanjiWKExists';
      }
    } else { // kanji doesn't exist on WK
      wkButtonTextDecoration = 'line-through';
      wkButtonClass = 'btnWKNonWKKanji';
      wkButtonHoverText = 'This kanji does not exist on wanikani.com.';
      //resultKanjiButtonClass = 'btnResultKanjiRTK';
    }
    if (!this.rtkMode) {
      resultKanjiButtonClass = 'btnResultKanjiWK'; // lower case for all keywords/meanings, more consistent and universal (e.g. Blue-black looks bad)
    }
    let leftPaddingPercent = 28;
    if (document.getElementById('search-box').clientWidth < 500) {
      leftPaddingPercent = 5; // less padding on small screens (e.g. mobile, portrait mode). TODO cleaner solution
    }
    const entry =
      '<div style="position: relative; left: ' + leftPaddingPercent + '%; text-align: center">'+
      // left: desktop: 37% for alignment with WK, 28% with kanji in chrome
      '<article>'+
      '  <h3 style="text-align: left">'+
      '    <a href="https://www.wanikani.com/kanji/'+page.kanji+'" ' +
             'style="text-decoration: '+wkButtonTextDecoration + '" ' +
             'title="'+wkButtonHoverText+'"' +
             'class="'+wkButtonClass+'" ' +
            '>WK</a>'+
      '    <button id="cbCopyButton'+page.id+'" title="Copy this kanji to clipboard">📋</button>' +
      '    <a class="'+resultKanjiButtonClass+'" href="https://jisho.org/search/'+page.kanji+'">'+page.kanji+' '+kanjiName+'</a>'+
      '  </h3>'+
      '</article></div>'
    ;
    return entry;
  }

  addCopyFunctionToEntry(page) {
    const self = this;
    document.getElementById('cbCopyButton'+page.id).onclick = function() {
      self.cbCopyButtonClick(page.id, page.kanji);
    }
  }

  searchByKanji(kanji, {
    updateHTMLElements = false
  } = {}) {
    let kanjiPage;
    let resultLength = 0;
    for (const doc of docs) {
      if (doc.kanji?.includes(kanji)) { // see 喩・喻
        kanjiPage = doc;
        resultLength = 1;
        break;
      }
    }
    if (updateHTMLElements) {
      if (this.entries) {
        this.entries.empty();
      } else { // this.entries is uninitialized before first search
        this.result  = $('#search-results');
        this.entries = $('#search-results .entries');
      }
      if (kanjiPage != null) {
        const entry = this.createEntry(kanjiPage);
        this.entries.append(entry);
        this.addCopyFunctionToEntry(kanjiPage);
        this.result.show();
      } else {
        this.entries.append(
          '<h3><i> The kanji ' + kanji + ' is not yet in our dataset.</i></h3>'
        );
        let mailSubjectString = '[wtksearch] Kanji not found'.replace(' ', '%20');
        let mailBodyString = 'Hello,\n\nthis kanji was missing on wtksearch.\n\n'+
        'Kanji: ' + kanji + '\n'+
        'Version: ' + document.getElementById(this.versionElementQuery).text + '\n' +
        '\n';
        mailBodyString = mailBodyString.replace(' ', '%20').replaceAll('\n', '%0A');
        this.entries.append(
          '<h4><a class="h4link" ' +
          'href="mailto:wtksearch@gmail.com?subject=' + mailSubjectString + '&body=' + mailBodyString +
          '">Report missing Kanji in a mail (using template)? ^.^</a> ' +
          '<a class="h4link" href="mailto:wtksearch@gmail.com">wtksearch@gmail.com</a>' +
          '</h4>'
        )
        this.result.show();
      }
    }
    let returnValue = {
      length: resultLength,
      list  : [kanjiPage],
    }
    returnValue[kanji] = kanjiPage;
    this.lastQuery = kanji;
    return returnValue;
  }

  cbCopyButtonClick(id, kanji) {
    const selectedClass = 'btnClipLastSelected';
    this.focusSearchBar();

    if (this.isVocabMode()) { // vocab/compound mode
      const vocabInput = document.getElementById(this.vocabInputQuery);
      if (!vocabInput.value) {
        document.getElementById(this.vocabInputQuery).value = kanji;
      } else {
        vocabInput.value += kanji;
      }
      navigator.clipboard.writeText(vocabInput.value);
      this.highlightButton(this.vocabCopyButtonQuery, this.vocabCopyButtonQuery);
      return;
    } else {
      navigator.clipboard.writeText(kanji);
      const copyButtonId = 'cbCopyButton' + id;
      const copyButton = document.getElementById(copyButtonId);

      if (copyButton.classList.contains(selectedClass)) {
        this.dehighlightButton(copyButtonId, id);
      } else {
        this.highlightButton(copyButtonId, id);
      }
    }

    // remove highlight from last button
    if (this.lastCopyButtonClickedId !== id && this.lastCopyButtonClickedId > -1) {
      document.getElementById('cbCopyButton' + this.lastCopyButtonClickedId)?.classList.remove(selectedClass);
    }
    this.lastCopyButtonClickedId = id;
  }

  highlightButton(buttonId, hashKey) {
    // dehighlight all other buttons:
    const entries = Object.entries(this.copyButtonsHighlighted);
    for (let i=0; i < entries.length; i++) {
      const entry = entries[i];
      const keyValue = entry[1]; // how Object.entries unloads this is weird, but oh well. just console.dir(entries) to see
      this.dehighlightButton(keyValue.buttonId, keyValue.hashKey);
    }
    // highlight this button:
    document.getElementById(buttonId).classList.add(this.copyButtonSelectedClass);
    this.copyButtonsHighlighted[hashKey] = {
      hashKey: hashKey,
      buttonId: buttonId
    }
  }

  dehighlightButton(buttonId, hashKey) {
    document.getElementById(buttonId)?.classList.remove(this.copyButtonSelectedClass);
    delete this.copyButtonsHighlighted[hashKey];
  }

  getRtkKeywordLists(rtkVersions) {
    let keywords = [];
    for (const rtkVersion of rtkVersions) {
      keywords.push(rtkVersion.split('&'));
    }
    return keywords;
  }

  checked(checkboxQuery) {
    return $(checkboxQuery).prop('checked');
  }

  isStrictMode() {
    return this.checked(this.checkboxStrictQuery);
  }

  isRtkMode() {
    return this.checked(this.checkboxRTKQuery);
  }

  // vocab/compound mode
  isVocabMode() {
    return this.checked(this.checkboxVocabQuery);
  }

  setupHTMLElements() {
    const checkboxStrictQuery = this.checkboxStrictQuery;
    const checkboxRTKQuery = this.checkboxRTKQuery;
    const checkboxStrictLabelQuery = this.checkboxStrictLabelQuery;
    const checkboxVocabQuery = this.checkboxVocabQuery;
    const params = this.getUrlParameters();

    const self = this; // this isn't available in anonymous functions
    $('#search-button').on('click', function() {
      return self.searchBarSearch();
    });
    
    document.getElementById(this.searchBarId).oninput = function() {
      return self.searchBarSearch();
    };

    // checkboxStrict.on('click', function() { // replaces click event completely
    $(checkboxStrictQuery).change(function() {
      self.focusSearchBar();
      return self.searchBarSearch(); // TODO optimization: don't search again when enabling strict mode, only re-filter. same for RTK checkbox
    });
    $(checkboxRTKQuery).change(function() {
      if (self.isRtkMode()) {
        $(checkboxStrictLabelQuery).prop('style')['text-decoration'] = 'line-through'; // strike-through
      } else {
        $(checkboxStrictLabelQuery).prop('style')['text-decoration'] = '';
      }
      self.focusSearchBar();
      return self.searchBarSearch();
    })
    $(checkboxVocabQuery).change(function() {
      if (self.isVocabMode()) {
        document.getElementById('vocabModeDiv').style.display = "block";
      } else {
        document.getElementById('vocabModeDiv').style.display = "none";
      }
      self.focusSearchBar();
    })
    document.getElementById(this.deleteVocabButtonQuery).onclick = function() {
      document.getElementById(self.vocabInputQuery).value = '';
      self.dehighlightButton(self.vocabCopyButtonQuery, self.vocabCopyButtonQuery);
      self.focusSearchBar();
    }
    document.getElementById(this.vocabCopyButtonQuery).onclick = function() {
      const compound = document.getElementById(self.vocabInputQuery).value;
      navigator.clipboard.writeText(compound);
      self.highlightButton(self.vocabCopyButtonQuery, self.vocabCopyButtonQuery);
      self.focusSearchBar();
    }

    if (params.strict === '1' || params.strict === 'true' && !this.isStrictMode()) {
      $(checkboxStrictQuery).click();
    }
    if (params.rtk === '1' || params.rtk === 'true' && !this.isRtkMode()) {
      $(checkboxRTKQuery).click();
    }
    if (params.compound === '1' || params.compound === 'true') {
      $(checkboxVocabQuery).click();
    }
    if (params.console === '1') {
      window.wtk = this; // make wtk available in the console
      // could also be window.wtksearch to avoid conflicts. but shorter/easier for now (debug)
    }

    const btnLatestKanji = document.getElementById('btnSearchLatestKanji');
    if (btnLatestKanji) {
      btnLatestKanji.onclick = function() {
        const searchBar = document.getElementById(self.searchBarId);
        searchBar.value = btnLatestKanji?.text;
        self.focusSearchBar();
        self.searchBarSearch();
        //self.searchByKanji(btnLatestKanji.text, { updateHTMLElements: true });
      };
    }
  }

  focusSearchBar() {
    document.getElementById(this.searchBarId).focus({preventScroll: true});
  }

  getUrlParameters() {
    let params = {};
    let parser = document.createElement('a');
    parser.href = window.location.href;
    const query = parser.search.substring(1);
    const vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
      const pair = vars[i].split('=');
      params[pair[0]] = decodeURIComponent(pair[1]);
    }
    return params;
  }

  is_short_rtk_keyword(query) {
    const small_rtk_keywords = [
      'i', 'in', 'ri', 'he', 'ax', 'of', 'go', 'me', 'do', 'v', 'x'
    ];
    return small_rtk_keywords.includes(query);
  }

  is_short_wk_keyword(query) {
    const small_wk_keywords = [
      'i', 'he', 'pi', 'go', 'do'
    ]
    return small_wk_keywords.includes(query);
  }

  // eliminate spaces so that all (input) radicals are separated by white space (" ").
  get_space_replacements() {
    return {
      "rice paddy": "ricepaddy",
      "older brother": "olderbrother",
      "younger brother": "youngerbrother",
      "to cut": "tocut", // custom radical from phonetic-semantic composition
      "coat rack": "coatrack",
      "older sister": "oldersister",
      "black hole": "blackhole",
      "turtle shell": "turtleshell",
      "long ago": "longago",
      "one sided": "onesided",
      "hot pepper": "hotpepper",
      "mona lisa": "monalisa",
      "top hat": "tophat",
      "death star": "deathstar",
      "not yet": "notyet", // officially jet in WK, but makes sense to distinguish from end/extremity (both jet in WK)
      "shamisen song": "shamisensong",
      "lip ring": "lipring",
      "slide seven": "slideseven",
      "seven slides": "slideseven",
      "seven slide": "slideseven",
      "good luck": "goodluck",
      "pass through": "passthrough",
      "treasure chest": "treasurechest",
      "ten thousand": "tenthousand",
      "line up": "lineup",
      "cat pirate": "catpirate",
      "crab trap": "crabtrap",
    }
  }

  get_wk_to_rtk_replacements() {
    return {
      "cross": "ten,needle",
      "sun": "sun,mortar", // mortar (臼) is given as sun in WK
      //"moon": "moon" or month, but kanji with month always also have moon, and not vice versa
      "month": "moon", // catch cases where only moon is given, see above
      "ricepaddy": "rice field,silage", // or silage, p354. RTK says sun for 更 again
      "net": "eye", // own radical in WK, just horizontal eye in RTK
      "dare": "risk", // not a WK radical, WK: sun + eye
      "crystal": "sparkle",
      "products": "goods",
      "bathtub": "spine",
      "world": "generation",
      "dawn": "nightbreak", // p25
      "former": "olden times", //p27
      "self": "self,oneself", // two self radicals in WK. the self that is 'snake' in RTK can also be 'self' there, but no difference for now
      "middle": "inX",
      "grid": "measuring box", // p29, WK: slide+twenty
      "circle": "round",
      "toe": "divining rod,magic wand",
      //"specialty": "accupuncturist", // p31, also specialty in another variation in RTK. rtk-search doesn't know accupuncturist
      "fortune": "fortune-telling",
      "table": "wind,eminent", // p33, collides with WK radical table and kanji table (RTK eminent). wind/weather vain? but weather vain not found in elements
      "morning": "mist", // p34
      "prison": "bound up", //or bound up small
      //"horns": "horns", // also animal horns in RTK, but i tagged everything with horns as well
      "child": "child,newborn babe", // conflict: this is the kanji child in WK (former+legs), but there's also the RTK child radical
      "shamisensong": "pop song",
      "chastity": "upright",
      "member": "employee",
      "origin": "beginning",
      "geoduck": "page",
      "paragraph": "phrase", //p41
      "season": "decameron", //p41
      "pool": "ladle", //p42
      //"neck": "neck",
      "nose": "fish guts", //p44
      "reality": "true", //p46
      "narwhal": "by one’s side",
      "construction": "craft",
      "have": "possess", //p47
      // sword, blade, cut all same
      "call": "seduce",
      "scarecrow": "wealth", //p50
      "town": "village", //p51
      "lipring": "can",
      "finish": "complete", //p53, only kanji in WK
      "like": "fond", //p54, only kanji in WK
      "mother": "mama", //p54, only kanji in WK
      "olderbrother": "elder brother",
      "small": "little", // triceratops and small are the same in RTK: little (or small)
      "big": "large",
      "sunlight": "ray", //p61
      "fat": "plump",
      "container": "utensil", //wk: kanji only
      "strange": "exquisite", //wk: kanji only
      "conserve": "focus", //wk: kanji only
      "odd": "strange", //p63
      "river": "stream",
      "original": "meadow,spring", //p67, or spring, without the cliff
      "temple": "buddhist temple", //p75
      "flame": "inflammation",
      "head": "hood,belt,headWK", //p83, or belt, p161, or headWK
      "roof": "house", //p85
      "letter": "character", //only kanji in WK
      "protect": "guard",
      "mutual": "mutual,inter", // conflict with other mutual kanji in WK
      "omen": "portent", //p104
      "nature": "sort of thing",
      "announce": "revelation",
      "previous": "before", //p108
      "hat": "umbrella", //p109
      "suit": "fit", //p110
      "all": "all,whole", //p114, only kanji in WK. ambiguous in WK: both 皆 and 全 called 'all'.
      // "reason": "logic", //283, only kanji in WK, conflicgt with WK radical reason
      "master": "lord",
      "scooter": "road", //p122
      "winter": "walking legs,taskmaster", //p125, or taskmaster, p137
      "kiss": "each",
      "forehead": "crown", //p128
      "lid table": "whirlwind",
      "lid mouth": "tall",
      "lid": "top hat", //p130
      //"samurai": "gentleman", //p134 // actually gentleman is only for the gentleman kanji which also has samurai as element.
      "viking": "schoolhouse",
      "warn": "admonish",
      "ceremony": "arrow", //p143
      "drunkard": "fiesta",
      "tocut": "thanksgiving", //p145, or ten fiesta. "to cut" is not from WK but from Jisho/Phonetic-semantic composition
      "become": "turn into", //p146
      "bar": "float", //p148
      "plan": "undertake", //p150, only kanji in WK
      "coatrack": "mending,zoo", //p152, or zoo, p155. zoo has downward stroke (drop) after the top line
      "yoga": "stretch",
      "clothes": "garment", //p156
      "cloth": "linen", //only kanji in WK
      // "towel ground": "market",
      "oldersister": "elder sister",
      "belt": "sash", //p161
      "heaven": "heavens,witch,sapling", // heavens p164
      "stand": "stand up", // only relevant for strict mode
      "chapter": "badge", //p166
      "mohawk": "antique", //p167
      "scent": "aroma",
      "back": "stature", //p170
      "point": "delicious",
      "gun": "reclining",
      "blackhole": "double back", //p175
      //"black hole": "double back",
      "clown": "muzzle", //p178
      "death": "deceased", //p180
      //"monk": "boy"
      "guard": "devil", //p183
      "mask": "formerly",
      "king": "king,porter,jewel,bushes,celery", // or porter, p185. bushes: p380 rtk3v4 (after kanji 1561)
      "alligator": "scorpion",
      "earth": "ground", //only kanji in WK
      "turtle": "tortoise,turtleWK", //p195
      "pig": "sow",
      "wings": "not", //p1128 or piglets, p197
      "easy": "piggy bank", //p197
      "hard": "harden", //p206
      "mouth": "mouth,pent in", //pent in p206
      "canopy": "cave",
      "storage": "warehouse", //p208
      "skewer": "shish kebab", //p210
      "feeling": "emotion", //p211
      "certain": "invariably,so-and-so", //p214. so-and-so: 1896
      "lantern": "two hands", //p219
      "stairs": "from", //p221. from is also sometimes called "fist" apparently, but there's also the fist element.
      "escalator": "reach out",
      "height": "length",
      "again": "grow late", //p223, or could also be 再      
      "stool": "crotch",
      "private": "elbow,receipt", //p229
      "machine": "pedestal",
      "past": "gone", //p231
      "meet": "meeting", // more specific/strict: meeting&mouth. meeting in RTK is only the top part (hat/umbrella + one), but mouth is basically always there too
      "mole": "climax",
      "trash": "infant", //p232
      "skin": "pelt", //p239
      "wave": "waves",
      // "valley": "valley", // somewhat similar: gully (p237), though that could be boat too
      "yakuza": "bone", //p240
      "row": "file", //only kanji in WK
      "fault": "lose", //p244
      "servant": "retainer",
      "giant": "gigantic",
      "go": "going",
      "loiter": "going",
      "grain": "wheat", //p251
      "attach": "adhere", //p265
      "dynamite": "third class", //p267
      "shrimp": "shaku,shaku-hachi", //p276
      "jackhammer": "show", //p1167, lesson30
      "reason": "sprout", //1186 wherefore as kanji, but always also sprout (or shoot, synonym)
      "turtleshell": "armor", //1194
      "humble": "monkey", //1198
      // "axe": "axe", // axe works better with rtk-search anyways
      "key": "saw", //1221*
      "wolverine": "broom",//1224*
      "conflict": "contend", //1238
      "buddy": "old boy", //1246
      "rake": "comb", //p290
      "box": "shovel", //p291
      "music": "bend", //1256
      "ladle": "big dipper",
      "task": "utilize", //1265
      "blackjack": "salad", //lesson32
      "longago": "once upon a time", //1268
      "yurt": "caverns,twenty", //p295, twenty is bottom part of caverns / below canopy
      "gladiator": "quarter", //p297
      "onesided": "one-sided", //1297
      "hills": "building blocks", //1299, also "of"
      "not": "negative",
      "arrow": "dart", //1305
      "spear": "halberd", //1311
      //"dollar": "dollarsign", //p302. here always dollar
      "beggar": "slingshot,snare", //p304. snare: p327 in rtk1v4, missing stick on top
      "give": "bestow",
      "body": "somebody", //1337
      "come": "scissors", //p307
      "mix": "mingle", //1368
      "foot": "leg", //1372
      "bone": "skeleton", //1383
      "zoom": "jawbone", //p311, doesn't really exist on WK, zoom is a personal mnemonic. could be zoommustache as well
      "mustache": "hood&mouth", // mustache in itself seems to be "hood mouth" in RTK, see 尚
      "building": "pinnacle,city walls", //lesson35, or city walls (p394, when on the right)
      "pi": "paper punch,hole", //p316. RTK doesn't differentiate between WK's pi and hole (added stick on top). though almost all paper punches in elements have hole as well, so far (until 2400)
      "poop": "cocoon", //p322
      "snake": "fingerprint", //p328
      "comb": "staples", //p329
      "alcohol": "whiskey bottle", // included in sign of the bird: 1534
      "plate": "dish", //1555
      "peace": "even", // or call, but covered by even
      "treasure": "sheaf,tucked under the arm", //p339 or arm maybe, p222
      "rocket": "sheik,top hat&villain&belt&elbow", //1605, sheik = 2047* (p12) in rtk3 = top hat villain belt elbow
      "dance": "ballerina", // or sometimes only sunglasses (right part of WK dance), RTK isn't clear on this (see shoeshine element). or dance in rtk-search
      "barracks": "earthworm,mountain goat,barracks", //p340 or mountain goat (p413), or barracks (2189)
      "spicy": "spicy,red pepper", // spicy or maybe red pepper sometimes
      "hotpepper": "ketchup", //p341
      //"hot pepper": "ketchup",
      "vines": "cornucopia", //p342
      "womb": "rice seedling&ground", //p343, RTK doesn't have womb as a radical
      "slice": "sign of the hog", //1637
      "angel": "resin,pole", //p345, or pole sometimes (missing the drop, e.g. needed for tea)
      "nurse": "grass skirt", //p346
      "life": "grow up,king,porter,celery", //p347, or king/porter. sometimes grow up e.g. for poison, = life in WK. RTK life is 1675. celery = two lives in lifeguard
      "signpost": "walking legs&bushes", //p350, signpost doesn't exist in RTK
      "plow": "christmas tree", //p35̂1
      "spring": "bonsai",
      "boot": "cabbage", //p353
      "chinese": "scarecrow", //p353
      "dangle": "droop",
      "monalisa": "concurrently", //1723
      "injustice": "un-", //1760
      "criminal": "un-",
      "hook": "key", //p363
      "korea": "locket", //p364
      "dry": "dry,potato,cornstalk", //1777, or potato (p366, needed for eaves/house counter), or cornstalk (p352, needed for dedicate)
      "surplus": "too much", //1786
      "squid": "awl", //p368
      "sick": "sickness", //lesson44
      "cage": "box", //p371
      "district": "ward", //1831
      "tent": "teepee", //p373
      "hair": "shape", //p374
      "scene": "scenery", //337
      "writing": "sentence", //1861
      "simultaneous": "adjusted", //1866
      "explosion": "sparkler",
      //"red: "apple", // just alternate name (?)
      "bed": "mosaic", //p380
      "crab": "bushel basket",
      "middle ground": "purse",
      "tophat": "shelf",
      "lineup": "row",
      "normal": "universal", //1925
      "yen": "circle", //1952
      "lifeguard": "funnel",
      "think": "think", //p391
      "energy": "reclining one fishhook", //energy doesn't exist in RTK
      //"energy treasure": "spirit", //2030, hard to match. there's also vapor for RTK
      "clan": "family name", //1970
      "clan ground": "calling card",
      "peoples": "people",
      "wedding": "dog tag",
      "cape": "clothes hanger",  //p397
      "pirate": "chihuahua with one human leg", //RTK1v6: p402 (2033), RTK3v4 2087: chihuahua with one human leg
      "face": "mask", //2039
      "catapult": "give", //2046
      "fang": "tusk", //2053
      "sickle": "animal tracks", // or grab, p228, which is covered by "cleat tree".
      "number": "turn", //2058
      "sake": "doX", //2067
      "ground kick": "hairpin",
      "grass": "owl",
      "football": "migrating ducks", //p412
      "hill": "mount", //2112
      "can": "tin can",
      "badger": "skunk", //p416
      "landslide": "sign of the dragon", //2164
      "horns heaven": "golden calf",
      "demon": "ghost", //2175
      "rust": "cinnabar",
      "rust colored": "cinnabar",
      "root": "silver",
      "umbrella": "fishhook,umbrellaWK",
      "spider": "streetwalker",
      "horse": "team of horses",
      "jet": "not yet,extremity", // not yet is with the shorter top stroke, extremity with the longer (末 end kanji)
      "notyet": "not yet", // officially jet in WK, but makes sense to distinguish from end/extremity
      "end": "extremity", // officially jet in WK, but makes sense to distinguish from not yet
      "gate": "gates",
      "tooth": "teeth",
      "wing": "knot",
      "fix": "straightaway",
      //"dirt": "soil,dirt", // WK dirt is primarily soil in RTK, but up to 2190 all kanji with soil also have dirt
      //"sweet": "sweet,wicker basket", // the sweet keyword in RTK is the same as the sweet primitive
      //"wrap": "wrap",
      "sock": "receive",
      "together": "strung together",
      //"lack": "lack,yawn", // all kanji up to 2288 have both lack and yawn
      //"beans": "beans,table",
      "stamp": "stamp,seal", // rarely seal, but e.g. for 昂 bottom right part
      "imperial": "dragon [old]",
      "twenty": "two hands,measuring box",
      "city": "market",
      "oneself": "self",
      "teacher": "filial piety",
      //"excuse": "excuse,village stocks", // primitive actually village stocks in RTK, but i annotated all the kanji with excuse as well
      "saw": "barge", // or craft&mediocre
      "comfort": "music",
      "festival": "ritual",
      "nothing": "nothingness",
      "treasurechest": "villain",
      "tenthousand": "ten thousand",
      "allocate": "allot",
      "cheap": "relax",
      "restaurant": "pavilion",
      "road": "road-way",
      "control": "system",
      "warehouse": "godown,warehouse", // warehouse WK radical is godown in RTK, but there's also the RTK warehouse kanji
      "farming": "agriculture",
      "catpirate": "stamp album", // or box stamps
      "syrup": "furniture", // or wooden goods, but that has too much "wood" in it for searching. e.g. 1469, syrup doesn't exist in RTK
      "shuriken": "mutually",
      "departure": "discharge",
      "valuable": "precious",
      "preserve": "protect",
      "shop": "roof",
      "wind": "windWK,wind", // the wk radical wind is the kanji 風, which doesn't have a unique name in rtk (wind is just the external part in rtk)
      "house": "houseWK,house", // the wk radical house is the kanji 家, which doesn't have a unique name in rtk (house is just the top part in rtk)
      "form": "contain",
      "crabtrap": "tremendously",
      "wild": "wreath", // or "laid waste", same thing basically
      // ---------------------------------- ^^ -------- //
      "slideseven": "lock of hair", //p407
      "tombstone": "spool", // p240 (rtk1v4)
      //"cactus": "cactus", // or mountain (split up), but for now no difference. rtk3v4: described in 聯 2676 strung together
      // ^ above checked with RTK physical edition, at least for WK radicals
      // ---- some WK radicals not existing in RTK ---- //
      "business": "upside down in a row", // plus not yet or tree or husband, but doesn't make a difference for now. also not clear.
      "youngerbrother": "horns&dollar",
      "guy": "good&city walls,silver&city walls", // 郷: silver+city walls, also guy in WK
      "penguin": "shredder&taskmaster",
      "frostbite": "dirt&walking legs",
      "satellite": "vulture&king&mountain",
      "bully": "ceiling&mouth&hood&human legs&street",
      "showy": "flowers&silage&ten,splendor", // WK kanji name showy is splendor in RTK
      "mantis": "gnats&drop&insect&belt",
      "goodluck": "samurai&mouth", // or good luck (kanji in RTK, not primitive)
      "poem": "flowers&phrase,poem", // the WK radical poem is flowers&phrase, but there's also the poem kanji that should be findable under poem
      "zombie": "earthenware jar&scarf", // or lidded crock&scarf
      "library": "flag&scrapbook",
      // --------------------------------------------
      "elf": "daring",
      "coral": "helping hand",
      "bear": "maestro without baton",
      "spikes": "row,upside down in a row",
      "pope": "ten&eye",
      "ground": "one,floor,ceiling",
      "creeper": "one&mouth,mouth&floor",
      "measurement": "glue",
      "commander": "leader",
      "bookshelf": "scrapbook", // or tome, but scrapbook always has tome as well (after my changes)
      "tofu": "rag", // actually exists in RTK, indirectly, description of 旅
      "coffin": "old man",
      // -------- these don't exist in RTK, need to be tagged with elementsWK --------
      "barb": "barbWK", // hook not correct apparently. just use barbWK as elementsWK
      "leaf": "leafWK",
      "slide": "slideWK,fishhook,hook",
      // -----------------------------------------------------------------------------
      // -------- some extra WK radicals (Kanji keywords). e.g. 戻 = return kanji in WK, but doesn't exist as radical
      // -------- see issue #2 -------------------------------------------------------
      "return": "re-", // enables searching for 涙 with "return" in WK mode
      "common": "commonplace",
      "first": "first time",
      "distinction": "discrimination", // 差
      "front": "in front",
      // "all": "all,whole", // all exists in RTK
      // "ashes": "ashes", // same in RTK
      // "hemp": "hemp", // same in RTK
      "distressed": "quandary",
      "distress": "quandary", // it's distressed on WK, but maybe someone types distress
      "passthrough": "traffic",
      "flat": "even", // WK radical: peace
      // -----------------------------------------------------------------------------
      //"stick": "stick", // or 'walking stick', but all kanji are just annotated with stick right now.
      "small drop": "valentine",
      "drop": "drop,drops",
      "fins": "animal legs,eight",
      "legs": "human legs,fenceposts", // or fenceposts, p377
      "lion": "straightened hook", // or fishhook sometimes? but all lion kanji from WK now have straightened hook or lionWK
      //"ground fins": "tool", // not ideal, this needs to be in combination
      "knife": "saber",
      "window": "breasts,mama", // FYI mama is only used for 2 kanji, mama and pierce
      "triceratops": "little", // triceratops and small are the same in RTK: little (or small)
      "cliff": "cliff,drag", // or drag, p396
      //"flood": "flood",
      "tsunami": "water",
      "boil": "oven-fire", // or barbecue
      //"flower": "flower",
      "greenhouse": "graveyard",
      "icicle": "turtle",
      "animal": "pack of dogs",
      "slide dirt": "cow",
      "hat ground": "meeting",
      "deathstar": "meeting&moon&saber", // or meeting of butchers. or meeting moon flood, but unnecessary for now. or convoy
      // or meeting moon flood for 喩 metaphor, but nothing else for now, and 喻 metaphor has saber too
      "dirt mouth": "lidded crock",
      //"brush": "brush",
      "kick": "scarf", // the left part can also be plow sometimes
      "spirit": "cloak,altar", // cloak has an extra stroke from bottom left to top right in the middle (to the right of the diagonal), altar doesn't.
      "cloud": "rising cloud",
      //"rain": "rain",
      //"ice": "ice",
      "insect": "insect", // not gnats, which is mantis
      //"turkey": "turkey",
      //"feathers": "feathers",
      "soul": "state of mind",
      "fingers": "finger",
      "weapon": "missile",
      "grave": "spool",
      "cleat": "vulture",
      "water": "grains of rice",
      "leader": "person",
      //"flag": "flag",
      "gambler": "strawman",
      "drop bear": "maestro",
      "hole": "hole", // RTK doesn't differentiate between WK's pi and hole (added stick on top) 
      // hole, house, miss world or paper punch seem to be mostly the same, but inconsistent in rtk-search.
      "mama": "chop-seal",
      "limit": "silver",
      //"good": "good alt",
      "helicopter": "old west",
      "charcoal": "pup tent",
      "long": "mane&hairpin",
      "splinter": "talking cricket",
      "village": "computer", // or ri, p80. but rtk-search has computer instead of ri
      //"tiger": "tiger",
      //"deer": "deer",
    }
  }

  LogLevels = {
    Silent: 0,
    Error: 1,
    Warn: 2,
    Info: 3,
    Debug: 4,
    Trace: 5,
  };

  log(logLevel, msg) {
    if (logLevel <= this.logLevel) {
      console.log(msg);
    }
  }
}

$(document).ready(function() {
  const wtk = new WTKSearch();

  wtk.setupHTMLElements();
  wtk.logLevel = wtk.LogLevels.Info; // use LogLevels.Silent to silence console.logs
});
